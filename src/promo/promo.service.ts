import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { BusService, type EventEnvelope } from '../bus/bus.service';
import type { Identity } from '../common/identity';
import { PROMO_REPO, type PromoRepo } from './promo.repo';
import { AGOTADA, MAX_PUESTOS, NO_GANADOR, STOCK_STORE, YA_RECLAMADA, type StockStore } from './stock.store';
import type { Coupon, LaunchPromoInput, PartidaFinalizada, Promo, Zone } from './promo.types';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function codigo(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

type Semilla = Omit<LaunchPromoInput, 'placeName' | 'zone'>;

/**
 * Promociones que se lanzan al arrancar si no hay ninguna vigente, para que
 * la demo no empiece vacía. Una es solo para ganadores del minijuego.
 */
const SEMILLA: Semilla[] = [
  { placeId: 'p7', title: '2x1 en cócteles de autor', discount: '2x1', stock: 6, durationS: 12 * 3600 },
  { placeId: 'p1', title: 'Postre de la casa gratis', discount: 'Postre gratis', stock: 4, durationS: 12 * 3600 },
  { placeId: 'p8', title: 'Primera cerveza por nuestra cuenta', discount: '1ª cerveza gratis', stock: 8, durationS: 12 * 3600 },
  {
    placeId: 'p9',
    title: 'Cover gratis para quien gane en el Snake',
    discount: 'Cover gratis',
    stock: 5,
    durationS: 12 * 3600,
    soloGanadores: true,
    puestos: 1,
  },
  { placeId: 'p24', title: 'Cóctel de bienvenida con la clase de salsa', discount: 'Cóctel gratis', stock: 10, durationS: 24 * 3600 },
  { placeId: 'p19', title: 'Una hora de tejo gratis para grupos de seis', discount: 'Tejo gratis', stock: 6, durationS: 24 * 3600 },
  { placeId: 'p30', title: '2x1 en boletas para la función de las 9:30', discount: '2x1', stock: 12, durationS: 24 * 3600 },
  {
    placeId: 'p32',
    title: 'Línea de bolos gratis para el podio del Snake',
    discount: 'Bolos gratis',
    stock: 6,
    durationS: 24 * 3600,
    soloGanadores: true,
    puestos: 3,
  },
];

/** Las victorias cuentan durante 3 días (ver stock.store.ts). */
const RETENCION_MS = 3 * 24 * 3600 * 1000;

/**
 * Promociones de stock finito y cupones.
 *
 * CC-1: el contador de stock vive en el StockStore (Redis en producción) y
 * solo se toca con `take`, que en un paso indivisible comprueba la regla de
 * la promo y resta. Aquí no hay ningún `if (stock > 0) stock--`.
 *
 * "Solo ganadores" (CC-1 + CC-2): promo escucha GAME.PARTIDA_FINALIZADA en el
 * bus y anota quién quedó en el podio. El script de reclamo exige que esa
 * persona haya quedado entre los primeros `puestos` de una partida terminada
 * DESPUÉS del lanzamiento: hay que jugar por el bono.
 *
 * Promociones y cupones viven en PostgreSQL (PromoRepo); sobreviven a un
 * redespliegue, y si Redis se vacía el stock se reconstruye desde los
 * cupones ya entregados.
 */
@Injectable()
export class PromoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromoService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly bus: BusService,
    @Inject(STOCK_STORE) private readonly stock: StockStore,
    @Inject(PROMO_REPO) private readonly repo: PromoRepo,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repo.init();
    this.bus.onEvent?.((sobre) => this.alEvento(sobre));

    // Reconstruir lo que vive en Redis por si se vació o es la primera vez.
    const ahora = Date.now();
    const vigentes = await this.repo.promosVigentes(ahora);
    const stocks = await this.stock.getMany(vigentes.map((p) => p.id));
    for (const [i, p] of vigentes.entries()) {
      if (stocks[i] === null) {
        const entregados = await this.repo.cuponesEntregados(p.id);
        await this.stock.init(p.id, Math.max(0, p.initialStock - entregados), (p.expiresAt - ahora) / 1000);
      }
      this.programarVencimiento(p);
    }
    for (const g of await this.repo.puestosDesde(ahora - RETENCION_MS)) {
      await this.stock.registrarPuesto(g.userId, g.puesto, g.at);
    }

    // Cada semilla se lanza si no hay una vigente igual (mismo lugar y título):
    // así una semilla nueva sale con el siguiente despliegue sin duplicar las demás.
    if (process.env.SEED_PROMOS !== 'false') {
      let lanzadas = 0;
      for (const s of SEMILLA) {
        if (vigentes.some((v) => v.placeId === s.placeId && v.title === s.title)) continue;
        const lugar = await this.repo.catalogo(s.placeId);
        if (!lugar) continue;
        await this.crear({ ...s, placeName: lugar.name, zone: lugar.zone }, false);
        lanzadas++;
      }
      if (lanzadas) this.logger.log(`${lanzadas} promociones semilla lanzadas.`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.timers.forEach((t) => clearTimeout(t));
    await this.repo.close?.();
  }

  /* ------------------------------------------------------------------ */
  /* lecturas                                                            */
  /* ------------------------------------------------------------------ */

  /** Activas: no vencidas y con stock > 0, con el stock real del almacén. */
  async listActive(zone?: Zone): Promise<Promo[]> {
    const candidatas = (await this.repo.promosVigentes(Date.now())).filter((p) => !zone || p.zone === zone);
    const stocks = await this.stock.getMany(candidatas.map((p) => p.id));
    const activas: Promo[] = [];
    candidatas.forEach((p, i) => {
      const s = stocks[i];
      if (s !== null && s > 0) activas.push({ ...p, stock: s });
    });
    return activas.sort((a, b) => a.expiresAt - b.expiresAt);
  }

  myCoupons(userId: string): Promise<Coupon[]> {
    return this.repo.cuponesDe(userId);
  }

  /* ------------------------------------------------------------------ */
  /* escrituras                                                          */
  /* ------------------------------------------------------------------ */

  /** POST /promos: solo el negocio dueño del establecimiento. */
  async launch(who: Identity, input: LaunchPromoInput): Promise<Promo> {
    const placeId = String(input?.placeId ?? who.placeId ?? '');
    if (who.placeId !== placeId) {
      throw new ForbiddenException({
        code: 'LUGAR_AJENO',
        message: 'Solo puedes lanzar promociones de tu propio establecimiento.',
      });
    }
    let lugar = await this.repo.catalogo(placeId);
    if (!lugar) {
      // Un lugar recién creado cuyo PLACE.CREATED no alcanzó a llegar (p. ej. promo
      // estaba reiniciando). Es su propio lugar, así que se acepta su nombre y zona.
      const name = String(input?.placeName ?? '').trim().slice(0, 60);
      const zone = input?.zone;
      if (!name || (zone !== 'zona-g' && zone !== 'zona-t')) {
        throw new NotFoundException({ code: 'LUGAR_NO_EXISTE', message: 'El establecimiento no existe.' });
      }
      lugar = { id: placeId, name, zone };
      await this.repo.guardarLugar(lugar);
    }

    const title = String(input?.title ?? '').trim();
    const discount = String(input?.discount ?? '').trim();
    const stock = Number(input?.stock);
    const durationS = Number(input?.durationS);
    const soloGanadores = input?.soloGanadores === true;
    const puestos = soloGanadores ? Number(input?.puestos ?? 1) : 1;
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
    if (!Number.isInteger(puestos) || puestos < 1 || puestos > MAX_PUESTOS) {
      throw new BadRequestException({ code: 'PUESTOS_INVALIDOS', message: 'Los puestos premiados van de 1 a 3.' });
    }
    return this.crear(
      { placeId, placeName: lugar.name, zone: lugar.zone, title, discount, stock, durationS, soloGanadores, puestos },
      true,
    );
  }

  /**
   * POST /promos/:id/claim (CC-1). Primero se descuenta en el almacén
   * (indivisible, con la regla de la promo adentro) y solo si hubo unidad se
   * emite el cupón. Cada rechazo dice por qué: nunca un éxito falso.
   */
  async claim(who: Identity & { userName: string }, promoId: string): Promise<Coupon> {
    const promo = await this.repo.promo(promoId);
    if (!promo) {
      throw new NotFoundException({ code: 'PROMO_NO_EXISTE', message: 'La promoción no existe.' });
    }
    if (Date.now() > promo.expiresAt) {
      throw new ConflictException({ code: 'PROMO_VENCIDA', message: 'La promoción ya venció.' });
    }

    const restante = await this.stock.take(promoId, who.userId, {
      soloGanadores: promo.soloGanadores,
      puestos: promo.puestos,
      desde: promo.launchedAt,
    });
    if (restante === YA_RECLAMADA) {
      throw new ConflictException({ code: 'YA_RECLAMADA', message: 'Ya tienes un cupón de esta promoción: está en Mis planes.' });
    }
    if (restante === NO_GANADOR) {
      throw new ForbiddenException({
        code: 'SOLO_GANADORES',
        message:
          promo.puestos === 1
            ? 'Este bono es solo para quien gane una partida del minijuego. ¡Ve a jugar y vuelve por él!'
            : `Este bono es para el top ${promo.puestos} de una partida del minijuego. ¡Ve a jugar y vuelve por él!`,
      });
    }
    if (restante === AGOTADA || restante < 0) {
      throw new ConflictException({
        code: 'PROMO_AGOTADA',
        message: 'Se agotó antes de que llegara tu solicitud. Te avisamos de la próxima.',
      });
    }

    const coupon = {
      id: randomUUID(),
      promoId,
      code: `PLZ-${codigo(5)}`,
      title: promo.title,
      discount: promo.discount,
      placeName: promo.placeName,
      claimedAt: Date.now(),
      userId: who.userId,
    };
    let guardado: boolean;
    try {
      guardado = await this.repo.guardarCupon(coupon);
    } catch (err) {
      // No se pudo guardar: se devuelve la unidad para no perderla.
      await this.stock.release(promoId, who.userId).catch(() => undefined);
      throw err;
    }
    if (!guardado) {
      await this.stock.release(promoId, who.userId).catch(() => undefined);
      throw new ConflictException({ code: 'YA_RECLAMADA', message: 'Ya tienes un cupón de esta promoción: está en Mis planes.' });
    }

    void this.bus.publish(
      'PROMO.WON',
      { promoId, placeId: promo.placeId, stock: restante, winner: who.userName, userId: who.userId },
      [`zone:${promo.zone}`, `place:${promo.placeId}`, `user:${who.userId}`],
    );

    const { userId: _omit, ...publico } = coupon;
    return publico;
  }

  /* ------------------------------------------------------------------ */
  /* eventos de otros servicios                                          */
  /* ------------------------------------------------------------------ */

  async alEvento(sobre: EventEnvelope): Promise<void> {
    if (sobre.type === 'PLACE.CREATED') {
      const p = (sobre.payload as { place?: { id?: string; name?: string; zone?: Zone } })?.place;
      if (p?.id && p.name && (p.zone === 'zona-g' || p.zone === 'zona-t')) {
        await this.repo.guardarLugar({ id: p.id, name: p.name, zone: p.zone });
      }
      return;
    }
    if (sobre.type === 'GAME.PARTIDA_FINALIZADA') {
      await this.registrarPartida(sobre.payload as PartidaFinalizada, sobre.at);
    }
  }

  /**
   * Anota el podio y avisa a quienes acaban de desbloquear un bono. Cada
   * persona recibe el aviso de cada bono una sola vez, aunque siga ganando.
   */
  async registrarPartida(partida: PartidaFinalizada, at?: number): Promise<void> {
    const fin = typeof partida?.finalizadaEn === 'number'
      ? partida.finalizadaEn
      : Date.parse(String(partida?.finalizadaEn ?? '')) || at || Date.now();

    const podio = new Map<string, { puesto: number; nombre: string }>();
    for (const l of partida?.puntajes ?? []) {
      if (l.posicionFinal >= 1 && l.posicionFinal <= MAX_PUESTOS) podio.set(l.jugadorId, { puesto: l.posicionFinal, nombre: l.jugadorNombre });
    }
    if (partida?.ganadorJugadorId && !podio.has(partida.ganadorJugadorId)) {
      podio.set(partida.ganadorJugadorId, { puesto: 1, nombre: partida.ganadorJugadorNombre ?? '' });
    }
    if (podio.size === 0) return;

    for (const [userId, { puesto }] of podio) {
      await this.stock.registrarPuesto(userId, puesto, fin);
      await this.repo.guardarPuesto(userId, puesto, fin, String(partida.salaId ?? ''));
    }

    const premios = (await this.listActive()).filter((p) => p.soloGanadores && p.launchedAt <= fin);
    for (const [userId, { puesto, nombre }] of podio) {
      for (const promo of premios.filter((p) => puesto <= p.puestos)) {
        if (!(await this.stock.avisarUnaVez(promo.id, userId))) continue;
        void this.bus.publish('PROMO.UNLOCKED', { promo, puesto, salaCodigo: partida.salaCodigo, nombre }, [`user:${userId}`]);
      }
    }
    this.logger.log(`Partida ${partida.salaCodigo ?? partida.salaId}: podio de ${podio.size} registrado.`);
  }

  /* ------------------------------------------------------------------ */
  /* internos                                                            */
  /* ------------------------------------------------------------------ */

  private async crear(
    datos: Required<Omit<LaunchPromoInput, 'soloGanadores' | 'puestos'>> & { soloGanadores?: boolean; puestos?: number },
    publicar: boolean,
  ): Promise<Promo> {
    const ahora = Date.now();
    const promo: Promo = {
      id: randomUUID(),
      placeId: datos.placeId,
      placeName: datos.placeName,
      zone: datos.zone,
      title: datos.title,
      discount: datos.discount,
      stock: datos.stock,
      initialStock: datos.stock,
      expiresAt: ahora + datos.durationS * 1000,
      launchedAt: ahora,
      soloGanadores: datos.soloGanadores === true,
      puestos: datos.soloGanadores ? (datos.puestos ?? 1) : 1,
    };
    await this.repo.guardarPromo(promo);
    await this.stock.init(promo.id, promo.stock, datos.durationS);

    if (publicar) void this.bus.publish('PROMO.PUSH', { ...promo }, [`zone:${promo.zone}`, `place:${promo.placeId}`]);
    this.programarVencimiento(promo);
    return { ...promo };
  }

  /** Al vencer, si quedaba stock, se avisa para que el mapa la retire. */
  private programarVencimiento(promo: Promo): void {
    const topics = [`zone:${promo.zone}`, `place:${promo.placeId}`];
    const t = setTimeout(() => {
      this.timers.delete(promo.id);
      void this.stock.getMany([promo.id]).then(([s]) => {
        // El contador ya expiró en Redis (TTL) o quedaba stock: se avisa igual.
        if (s === null || s > 0) void this.bus.publish('PROMO.EXPIRED', { promoId: promo.id, placeId: promo.placeId }, topics);
      });
    }, Math.max(0, promo.expiresAt - Date.now()));
    t.unref();
    this.timers.set(promo.id, t);
  }
}
