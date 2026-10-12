import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { BusService } from '../bus/bus.service';
import { MemoryPromoRepo, PgPromoRepo, type PromoRepo } from './promo.repo';
import { PromoService } from './promo.service';
import { MemoryStockStore } from './stock.store';
import type { PartidaFinalizada } from './promo.types';

/**
 * Las mismas pruebas corren con el repositorio en memoria y, si hay
 * TEST_DATABASE_URL, con PostgreSQL real (recrea el esquema `promo`).
 * El stock usa el almacén en memoria, que cumple el mismo contrato que el
 * script Lua de Redis.
 */
const PG_URL = process.env.TEST_DATABASE_URL;
const repos: Array<[string, () => Promise<PromoRepo>]> = [['memoria', async () => new MemoryPromoRepo()]];
if (PG_URL) {
  repos.push([
    'postgres',
    async () => {
      const pool = new Pool({ connectionString: PG_URL });
      await pool.query('DROP SCHEMA IF EXISTS promo CASCADE');
      await pool.end();
      return new PgPromoRepo(PG_URL);
    },
  ]);
}

const NEGOCIO = { userId: 'b1', role: 'negocio' as const, placeId: 'p7' };
const CLIENTE = { userId: 'u1', role: 'cliente' as const, userName: 'Juan Diego' };

const codigo = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return ((e as ConflictException).getResponse() as { code: string }).code;
  }
};

function partida(podio: Array<[string, number]>, finalizadaEn = new Date().toISOString()): PartidaFinalizada {
  return {
    salaId: 'sala-1',
    salaCodigo: 'CARTAGENA',
    ganadorJugadorId: podio.find(([, p]) => p === 1)?.[0] ?? null,
    ganadorJugadorNombre: 'Ganador',
    puntajes: podio.map(([jugadorId, posicionFinal]) => ({
      jugadorId,
      jugadorNombre: jugadorId,
      puntaje: 10 - posicionFinal,
      posicionFinal,
      sobrevivio: posicionFinal === 1,
    })),
    finalizadaEn,
  };
}

describe.each(repos)('PromoService (%s)', (_nombre, crearRepo) => {
  let servicio: PromoService;
  let publicados: Array<{ type: string; payload: unknown; topics: string[] }>;

  beforeEach(async () => {
    publicados = [];
    const bus = {
      publish: async (type: string, payload: unknown, topics: string[]) => {
        publicados.push({ type, payload, topics });
      },
    } as unknown as BusService;
    process.env.SEED_PROMOS = 'false';
    servicio = new PromoService(bus, new MemoryStockStore(), await crearRepo());
    await servicio.onModuleInit();
  });

  afterEach(async () => {
    await servicio.onModuleDestroy();
  });

  const lanzar = (extra: Record<string, unknown> = {}) =>
    servicio.launch(NEGOCIO, { placeId: 'p7', title: 'Promo', discount: '-50%', stock: 2, durationS: 60, ...extra });

  it('lanza una promoción y la lista como activa con su stock', async () => {
    const promo = await lanzar({ title: '2x1 en cócteles', discount: '2x1', stock: 3 });
    expect(promo).toMatchObject({ placeName: 'Bar El Zaguán', zone: 'zona-t', initialStock: 3, soloGanadores: false });
    expect(publicados[0]).toMatchObject({ type: 'PROMO.PUSH', topics: ['zone:zona-t', 'place:p7'] });

    const activas = await servicio.listActive('zona-t');
    expect(activas).toHaveLength(1);
    expect(activas[0].stock).toBe(3);
    expect(await servicio.listActive('zona-g')).toHaveLength(0);
  });

  it('no deja lanzar promociones de un establecimiento ajeno', async () => {
    await expect(
      servicio.launch(NEGOCIO, { placeId: 'p1', title: 'x', discount: 'y', stock: 1, durationS: 60 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CC-1: entrega exactamente `stock` cupones y después responde PROMO_AGOTADA', async () => {
    const promo = await lanzar({ stock: 2 });
    const resultados = await Promise.all(
      Array.from({ length: 50 }, (_, i) => codigo(servicio.claim({ ...CLIENTE, userId: `u${i}` }, promo.id))),
    );
    expect(resultados.filter((r) => r === 'OK')).toHaveLength(2);
    expect(resultados.filter((r) => r === 'PROMO_AGOTADA')).toHaveLength(48);
    expect(publicados.filter((e) => e.type === 'PROMO.WON')).toHaveLength(2);
    expect(await servicio.listActive()).toHaveLength(0);
  });

  it('cada persona reclama una sola vez la misma promoción', async () => {
    const promo = await lanzar({ stock: 5 });
    const resultados = await Promise.all(Array.from({ length: 5 }, () => codigo(servicio.claim(CLIENTE, promo.id))));
    expect(resultados.filter((r) => r === 'OK')).toHaveLength(1);
    expect(resultados.filter((r) => r === 'YA_RECLAMADA')).toHaveLength(4);
    expect((await servicio.listActive())[0].stock).toBe(4);
  });

  it('el cupón entregado queda en /promos/mine del ganador', async () => {
    const promo = await lanzar({ stock: 1 });
    const cupon = await servicio.claim(CLIENTE, promo.id);
    expect(cupon.code).toMatch(/^PLZ-[A-Z2-9]{5}$/);
    expect(cupon.placeName).toBe('Bar El Zaguán');
    expect(await servicio.myCoupons('u1')).toEqual([cupon]);
    expect(await servicio.myCoupons('u2')).toEqual([]);
  });

  it('rechaza reclamar una promoción vencida o inexistente', async () => {
    await expect(servicio.claim(CLIENTE, '00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(NotFoundException);
    const promo = await lanzar({ stock: 1, durationS: 10 });
    const ahora = Date.now;
    Date.now = () => ahora() + 11_000;
    try {
      await expect(servicio.claim(CLIENTE, promo.id)).rejects.toMatchObject({ response: { code: 'PROMO_VENCIDA' } });
    } finally {
      Date.now = ahora;
    }
  });

  describe('solo ganadores del minijuego', () => {
    it('quien no ha ganado recibe SOLO_GANADORES; el ganador sí la reclama', async () => {
      const promo = await lanzar({ soloGanadores: true, puestos: 1, stock: 3 });
      expect(await codigo(servicio.claim({ ...CLIENTE, userId: 'c-ana' }, promo.id))).toBe('SOLO_GANADORES');

      await servicio.registrarPartida(partida([['c-ana', 1], ['c-beto', 2], ['c-caro', 3]]));

      expect(await codigo(servicio.claim({ ...CLIENTE, userId: 'c-ana' }, promo.id))).toBe('OK');
      // Segundo y tercer puesto no alcanzan si la promo es solo para el primero.
      expect(await codigo(servicio.claim({ ...CLIENTE, userId: 'c-beto' }, promo.id))).toBe('SOLO_GANADORES');
    });

    it('con puestos = 3 premia el podio y avisa a cada uno con PROMO.UNLOCKED', async () => {
      const promo = await lanzar({ soloGanadores: true, puestos: 3, stock: 10 });
      await servicio.registrarPartida(partida([['c-ana', 1], ['c-beto', 2], ['c-caro', 3], ['c-dani', 4]]));

      const avisos = publicados.filter((e) => e.type === 'PROMO.UNLOCKED');
      expect(avisos.map((a) => a.topics[0]).sort()).toEqual(['user:c-ana', 'user:c-beto', 'user:c-caro']);

      const r = await Promise.all(['c-ana', 'c-beto', 'c-caro', 'c-dani'].map((u) => codigo(servicio.claim({ ...CLIENTE, userId: u }, promo.id))));
      expect(r).toEqual(['OK', 'OK', 'OK', 'SOLO_GANADORES']);
    });

    it('una victoria de ANTES del lanzamiento no cuenta: hay que jugar por el bono', async () => {
      await servicio.registrarPartida(partida([['c-ana', 1]], new Date(Date.now() - 60_000).toISOString()));
      const promo = await lanzar({ soloGanadores: true, puestos: 1 });
      expect(await codigo(servicio.claim({ ...CLIENTE, userId: 'c-ana' }, promo.id))).toBe('SOLO_GANADORES');
    });

    it('CC-1 + CC-2: con muchos ganadores compitiendo, el stock se respeta', async () => {
      const promo = await lanzar({ soloGanadores: true, puestos: 3, stock: 4 });
      const ganadores = Array.from({ length: 30 }, (_, i) => `c-g${i}`);
      // Diez partidas simultáneas, tres ganadores por partida.
      await Promise.all(
        Array.from({ length: 10 }, (_, k) => servicio.registrarPartida(partida([[ganadores[3 * k], 1], [ganadores[3 * k + 1], 2], [ganadores[3 * k + 2], 3]]))),
      );
      const r = await Promise.all([...ganadores, 'c-mirona'].map((u) => codigo(servicio.claim({ ...CLIENTE, userId: u }, promo.id))));
      expect(r.filter((x) => x === 'OK')).toHaveLength(4);
      expect(r.filter((x) => x === 'PROMO_AGOTADA')).toHaveLength(26);
      expect(r.at(-1)).not.toBe('OK');
    });
  });

  it('un lugar creado por un negocio entra al catálogo por el bus y puede lanzar promos', async () => {
    await servicio.alEvento({
      id: 'e1',
      type: 'PLACE.CREATED',
      topics: ['zone:zona-g'],
      payload: { place: { id: 'l-abc123', name: 'Telaraña Bar', zone: 'zona-g' } },
      at: Date.now(),
    });
    const p = await servicio.launch(
      { userId: 'n-1', role: 'negocio', placeId: 'l-abc123' },
      { placeId: 'l-abc123', title: 'Shot de bienvenida', discount: 'Gratis', stock: 2, durationS: 60 },
    );
    expect(p).toMatchObject({ placeName: 'Telaraña Bar', zone: 'zona-g' });
  });
});
