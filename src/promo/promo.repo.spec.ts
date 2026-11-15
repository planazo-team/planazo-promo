import { Pool } from 'pg';
import { MemoryPromoRepo, PgPromoRepo, crearPromoRepo } from './promo.repo';
import type { StoredCoupon } from './promo.repo';
import type { CatalogPlace, Promo } from './promo.types';
import { config } from '../config';

jest.mock('pg', () => {
  const mClient = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
  const mPool = {
    connect: jest.fn().mockResolvedValue(mClient),
    query: jest.fn().mockResolvedValue({ rows: [] }),
    on: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  };
  return {
    Pool: jest.fn(() => mPool),
  };
});

describe('PromoRepo', () => {
  describe('MemoryPromoRepo', () => {
    let repo: MemoryPromoRepo;

    beforeEach(async () => {
      repo = new MemoryPromoRepo();
      await repo.init();
    });

    it('debe contener catálogo semilla por defecto', async () => {
      const lugar = await repo.catalogo('p1');
      expect(lugar).toBeDefined();
      expect(lugar?.name).toBe('Fideos de la Nona');
    });

    it('debe guardar y recuperar nuevo lugar', async () => {
      const nuevo: CatalogPlace = { id: 'lugar-x', name: 'Bar X', zone: 'zona-t' };
      await repo.guardarLugar(nuevo);
      const res = await repo.catalogo('lugar-x');
      expect(res).toEqual(nuevo);
    });

    it('debe guardar y obtener promo', async () => {
      const promo: Promo = {
        id: 'promo-1',
        placeId: 'irish-pub',
        placeName: 'The Irish Pub',
        zone: 'zona-t',
        title: 'Happy Hour',
        discount: '30%',
        stock: 5,
        initialStock: 5,
        expiresAt: Date.now() + 60000,
        launchedAt: Date.now(),
        soloGanadores: false,
        puestos: 1,
      };
      await repo.guardarPromo(promo);
      const res = await repo.promo('promo-1');
      expect(res).toEqual(promo);

      const vigente = await repo.promosVigentes(Date.now());
      expect(vigente.some((p) => p.id === 'promo-1')).toBe(true);

      const noVigente = await repo.promosVigentes(Date.now() + 100000);
      expect(noVigente.some((p) => p.id === 'promo-1')).toBe(false);
    });

    it('debe guardar cupones y evitar duplicados por promo y usuario', async () => {
      const cupon: StoredCoupon = {
        id: 'c1',
        promoId: 'promo-1',
        code: 'COD-1',
        title: 'Happy Hour',
        discount: '30%',
        placeName: 'The Irish Pub',
        claimedAt: 1000,
        userId: 'u1',
      };

      const primero = await repo.guardarCupon(cupon);
      expect(primero).toBe(true);

      const segundo = await repo.guardarCupon(cupon);
      expect(segundo).toBe(false);

      const misCupones = await repo.cuponesDe('u1');
      expect(misCupones).toHaveLength(1);
      expect(misCupones[0].code).toBe('COD-1');

      const entregados = await repo.cuponesEntregados('promo-1');
      expect(entregados).toBe(1);
    });

    it('debe guardar y listar puestos de minijuego', async () => {
      const ahora = Date.now();
      await repo.guardarPuesto('u1', 1, ahora, 'sala-1');
      await repo.guardarPuesto('u2', 2, ahora - 10000, 'sala-1');

      const puestos = await repo.puestosDesde(ahora - 5000);
      expect(puestos).toHaveLength(1);
      expect(puestos[0].userId).toBe('u1');
    });
  });

  describe('PgPromoRepo', () => {
    let pgRepo: PgPromoRepo;

    beforeEach(() => {
      jest.clearAllMocks();
      pgRepo = new PgPromoRepo('postgres://localhost:5432/test');
    });

    it('debe inicializar el esquema y catálogo semilla con advisory lock', async () => {
      await pgRepo.init();
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      expect(poolInstance.connect).toHaveBeenCalled();
    });

    it('debe consultar catálogo en postgres', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({
        rows: [{ id: 'p1', name: 'Bar 1', zone: 'zona-g' }],
      });

      const res = await pgRepo.catalogo('p1');
      expect(res).toEqual({ id: 'p1', name: 'Bar 1', zone: 'zona-g' });
    });

    it('debe retornar null en catalogo si no existe', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({ rows: [] });

      const res = await pgRepo.catalogo('inexistente');
      expect(res).toBeNull();
    });

    it('debe guardar lugar en postgres', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({ rows: [] });

      await pgRepo.guardarLugar({ id: 'p2', name: 'Bar 2', zone: 'zona-t' });
      expect(poolInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO promo.lugares'),
        ['p2', 'Bar 2', 'zona-t'],
      );
    });

    it('debe guardar promo en postgres', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({ rows: [] });

      const promo: Promo = {
        id: '11111111-1111-1111-1111-111111111111',
        placeId: 'place-1',
        placeName: 'Place 1',
        zone: 'zona-g',
        title: 'Promo 1',
        discount: '20%',
        stock: 10,
        initialStock: 10,
        expiresAt: 2000,
        launchedAt: 1000,
        soloGanadores: false,
        puestos: 1,
      };

      await pgRepo.guardarPromo(promo);
      expect(poolInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO promo.promos'),
        expect.arrayContaining(['Promo 1']),
      );
    });

    it('debe validar formato uuid en promo(id)', async () => {
      const invalid = await pgRepo.promo('no-es-uuid');
      expect(invalid).toBeNull();
    });

    it('debe retornar promo válida consultada por uuid', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            place_id: 'p1',
            place_name: 'Name',
            zone: 'zona-t',
            title: 'T',
            discount: '10%',
            initial_stock: 5,
            expires_at: 5000,
            launched_at: 1000,
            solo_ganadores: false,
            puestos: 1,
          },
        ],
      });

      const res = await pgRepo.promo('11111111-1111-1111-1111-111111111111');
      expect(res).toBeDefined();
      expect(res?.title).toBe('T');
    });

    it('debe listar promos vigentes en postgres', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            place_id: 'p1',
            place_name: 'Name',
            zone: 'zona-t',
            title: 'T',
            discount: '10%',
            initial_stock: 5,
            expires_at: 5000,
            launched_at: 1000,
            solo_ganadores: true,
            puestos: 3,
          },
        ],
      });

      const res = await pgRepo.promosVigentes(1000);
      expect(res).toHaveLength(1);
      expect(res[0].soloGanadores).toBe(true);
    });

    it('debe guardar cupon y devolver si fue insertado', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({ rowCount: 1 });

      const ok = await pgRepo.guardarCupon({
        id: 'c1',
        promoId: 'p1',
        code: 'COD',
        title: 'Tit',
        discount: '15%',
        placeName: 'Bar',
        claimedAt: 1234,
        userId: 'u1',
      });
      expect(ok).toBe(true);
    });

    it('debe listar cupones de un usuario', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'c1',
            promo_id: 'p1',
            code: 'COD',
            title: 'Tit',
            discount: '15%',
            place_name: 'Bar',
            claimed_at: '1234',
          },
        ],
      });

      const cupones = await pgRepo.cuponesDe('u1');
      expect(cupones).toHaveLength(1);
      expect(cupones[0].claimedAt).toBe(1234);
    });

    it('debe contar cupones entregados', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({
        rows: [{ n: 7 }],
      });

      const total = await pgRepo.cuponesEntregados('p1');
      expect(total).toBe(7);
    });

    it('debe guardar puesto y consultar puestos desde', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      poolInstance.query.mockResolvedValueOnce({ rows: [] });

      await pgRepo.guardarPuesto('u1', 1, 5000, 'sala-1');
      expect(poolInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO promo.puestos'),
        ['u1', 1, 5000, 'sala-1'],
      );

      poolInstance.query.mockResolvedValueOnce({
        rows: [{ user_id: 'u1', puesto: 1, at: '5000' }],
      });
      const lista = await pgRepo.puestosDesde(4000);
      expect(lista).toEqual([{ userId: 'u1', puesto: 1, at: 5000 }]);
    });

    it('debe cerrar la conexión al invocar close', async () => {
      const poolInstance = (Pool as unknown as jest.Mock).mock.results[0].value;
      await pgRepo.close();
      expect(poolInstance.end).toHaveBeenCalled();
    });
  });

  describe('crearPromoRepo', () => {
    it('debe crear PgPromoRepo si databaseUrl está configurada', () => {
      const mutableConfig = config as any;
      const prev = mutableConfig.databaseUrl;
      mutableConfig.databaseUrl = 'postgres://test:5432/db';
      const repo = crearPromoRepo();
      expect(repo).toBeInstanceOf(PgPromoRepo);
      mutableConfig.databaseUrl = prev;
    });

    it('debe crear MemoryPromoRepo si databaseUrl no está configurada', () => {
      const mutableConfig = config as any;
      const prev = mutableConfig.databaseUrl;
      mutableConfig.databaseUrl = '';
      const repo = crearPromoRepo();
      expect(repo).toBeInstanceOf(MemoryPromoRepo);
      mutableConfig.databaseUrl = prev;
    });
  });
});
