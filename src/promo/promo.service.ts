import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { BusService } from '../bus/bus.service';
import type { Identity } from '../common/identity';
import { CATALOGO } from './catalogo';
import { STOCK_STORE, type StockStore } from './stock.store';
import type { Coupon, LaunchPromoInput, Promo, Zone } from './promo.types';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function codigo(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/** Promociones que se lanzan al arrancar para que la demo no empiece vacía. */
const SEMILLA: Array<Omit<LaunchPromoInput, 'durationS'> & { durationS: number }> = [
  { placeId: 'p7', title: '2x1 en cócteles de autor', discount: '2x1', stock: 6, durationS: 3 * 3600 },
  { placeId: 'p1', title: 'Postre de la casa gratis', discount: 'Postre gratis', stock: 4, durationS: 3 * 3600 },
  { placeId: 'p8', title: 'Primera cerveza por nuestra cuenta', discount: '-100% 1ª cerveza', stock: 8, durationS: 3 * 3600 },
];

/**
 * Promociones de stock finito y cupones.
 *
 * CC-1: el contador de stock vive en el StockStore (Redis en producción) y
 * solo se toca con `take`, un decremento indivisible. Aquí no hay ningún
 * `if (stock > 0) stock--`: eso sería la carrera que el reto prohíbe.
 *
 * Las promociones y los cupones emitidos viven en memoria en este MVP, igual
 * que el inventario de booking; pasarlos a PostgreSQL no cambia la regla.
 */
@Injectable()
export class PromoService implements OnModuleInit {
  private readonly logger = new Logger(PromoService.name);
  private readonly promos = new Map<string, Promo>();
  private readonly coupons: Array<Coupon & { userId: string }> = [];

  constructor(
    private readonly bus: BusService,
    @Inject(STOCK_STORE) private readonly stock: StockStore,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.SEED_PROMOS === 'false') return;
    for (const s of SEMILLA) {
      const lugar = CATALOGO[s.placeId];
      await this.crear({ ...s, placeName: lugar.name, zone: lugar.zone }, false);
    }
    this.logger.log(`${SEMILLA.length} promociones semilla lanzadas.`);
  }

  /* ------------------------------------------------------------------ */
  /* lecturas                                                            */
  /* ------------------------------------------------------------------ */

  /** Activas: no vencidas y con stock > 0, con el stock real del almacén. */
  async listActive(zone?: Zone): Promise<Promo[]> {
    const ahora = Date.now();
    const candidatas = [...this.promos.values()].filter(
      (p) => p.expiresAt > ahora && (!zone || p.zone === zone),
    );
    const stocks = await this.stock.getMany(candidatas.map((p) => p.id));
    const activas: Promo[] = [];
    candidatas.forEach((p, i) => {
      const s = stocks[i];
      if (s !== null && s > 0) activas.push({ ...p, stock: s });
    });
    return activas.sort((a, b) => a.expiresAt - b.expiresAt);
  }

  myCoupons(userId: string): Coupon[] {
    return this.coupons
      .filter((c) => c.userId === userId)
      .map(({ userId: _u, ...c }) => c)
      .sort((a, b) => b.claimedAt - a.claimedAt);
  }

  /* ------------------------------------------------------------------ */
  /* escrituras                                                          */
  /* ------------------------------------------------------------------ */

  /** POST /promos: solo el negocio dueño del establecimiento. */
  async launch(who: Identity, input: LaunchPromoInput): Promise<Promo> {
    const placeId = String(input?.placeId ?? who.placeId ?? '');
    const lugar = CATALOGO[placeId];
    if (!lugar) {
      throw new NotFoundException({ code: 'LUGAR_NO_EXISTE', message: 'El establecimiento no existe.' });
    }
    if (who.placeId !== placeId) {
      throw new ForbiddenException({
        code: 'LUGAR_AJENO',
        message: 'Solo puedes lanzar promociones de tu propio establecimiento.',
      });
    }
    const title = String(input?.title ?? '').trim();
    const discount = String(input?.discount ?? '').trim();
    const stock = Number(input?.stock);
    const durationS = Number(input?.durationS);
    if (!title || title.length > 80) {
      throw new BadRequestException({ code: 'TITULO_INVALIDO', message: 'El título es obligatorio (máx. 80 caracteres).' });
    }
    if (!discount || discount.length > 40) {
      throw new BadRequestException({ code: 'DESCUENTO_INVALIDO', message: 'Indica el descuento (máx. 40 caracteres).' });
    }
    if (!Number.isInteger(stock) || stock < 1 || stock > 1000) {
      throw new BadRequestException({ code: 'STOCK_INVALIDO', message: 'El stock debe ser un entero entre 1 y 1000.' });
    }
    if (!Number.isInteger(durationS) || durationS < 10 || durationS > 86_400) {
      throw new BadRequestException({
        code: 'DURACION_INVALIDA',
        message: 'La duración debe estar entre 10 segundos y 24 horas.',
      });
    }
    return this.crear({ placeId, placeName: lugar.name, zone: lugar.zone, title, discount, stock, durationS }, true);
  }

  /**
   * POST /promos/:id/claim (CC-1). El orden importa: primero se descuenta en
   * el almacén (indivisible) y solo si hubo unidad se emite el cupón. Si se
   * agotó, 409 PROMO_AGOTADA con mensaje explícito: nunca un éxito falso.
   */
  async claim(who: Identity & { userName: string }, promoId: string): Promise<Coupon> {
    const promo = this.promos.get(promoId);
    if (!promo) {
      throw new NotFoundException({ code: 'PROMO_NO_EXISTE', message: 'La promoción no existe.' });
    }
    if (Date.now() > promo.expiresAt) {
      throw new ConflictException({ code: 'PROMO_VENCIDA', message: 'La promoción ya venció.' });
    }

    const restante = await this.stock.take(promoId);
    if (restante < 0) {
      throw new ConflictException({
        code: 'PROMO_AGOTADA',
        message: 'Se agotó antes de que llegara tu solicitud. Te avisamos de la próxima.',
      });
    }

    const coupon: Coupon & { userId: string } = {
      id: randomUUID(),
      promoId,
      code: `PLZ-${codigo(5)}`,
      title: promo.title,
      discount: promo.discount,
      placeName: promo.placeName,
      claimedAt: Date.now(),
      userId: who.userId,
    };
    this.coupons.push(coupon);

    void this.bus.publish(
      'PROMO.WON',
      { promoId, placeId: promo.placeId, stock: restante, winner: who.userName, userId: who.userId },
      [`zone:${promo.zone}`, `place:${promo.placeId}`, `user:${who.userId}`],
    );

    const { userId: _omit, ...publico } = coupon;
    return publico;
  }

  /* ------------------------------------------------------------------ */
  /* internos                                                            */
  /* ------------------------------------------------------------------ */

  private async crear(
    datos: { placeId: string; placeName: string; zone: Zone; title: string; discount: string; stock: number; durationS: number },
    publicar: boolean,
  ): Promise<Promo> {
    const promo: Promo = {
      id: randomUUID(),
      placeId: datos.placeId,
      placeName: datos.placeName,
      zone: datos.zone,
      title: datos.title,
      discount: datos.discount,
      stock: datos.stock,
      initialStock: datos.stock,
      expiresAt: Date.now() + datos.durationS * 1000,
    };
    await this.stock.init(promo.id, promo.stock, datos.durationS);
    this.promos.set(promo.id, promo);

    const topics = [`zone:${promo.zone}`, `place:${promo.placeId}`];
    if (publicar) void this.bus.publish('PROMO.PUSH', { ...promo }, topics);

    // Al vencer, si quedaba stock, se avisa para que el mapa la retire.
    const timer = setTimeout(() => {
      void this.alVencer(promo.id, topics);
    }, datos.durationS * 1000);
    timer.unref();

    return { ...promo };
  }

  private async alVencer(promoId: string, topics: string[]): Promise<void> {
    const promo = this.promos.get(promoId);
    if (!promo) return;
    const [stock] = await this.stock.getMany([promoId]);
    if (stock !== null && stock > 0) {
      void this.bus.publish('PROMO.EXPIRED', { promoId, placeId: promo.placeId }, topics);
    }
  }
}
