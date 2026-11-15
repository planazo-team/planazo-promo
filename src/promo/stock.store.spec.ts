import {
  AGOTADA,
  MemoryStockStore,
  NO_GANADOR,
  RedisStockStore,
  YA_RECLAMADA,
  crearStockStore,
} from './stock.store';
import { config } from '../config';

const mRedisInstance = {
  defineCommand: jest.fn(),
  on: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  tomarUnidad: jest.fn(),
  devolverUnidad: jest.fn().mockResolvedValue(1),
  mget: jest.fn(),
  multi: jest.fn(() => ({
    zadd: jest.fn().mockReturnThis(),
    zremrangebyscore: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  })),
  avisarUnaVez: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn(() => mRedisInstance);
});

describe('StockStore', () => {
  describe('MemoryStockStore', () => {
    let store: MemoryStockStore;

    beforeEach(() => {
      store = new MemoryStockStore();
    });

    it('debe inicializar y tomar stock con éxito', async () => {
      await store.init('p1', 2, 60);

      const regla = { soloGanadores: false, puestos: 1, desde: 0 };
      const rem1 = await store.take('p1', 'u1', regla);
      expect(rem1).toBe(1);

      const rem2 = await store.take('p1', 'u2', regla);
      expect(rem2).toBe(0);

      const agotada = await store.take('p1', 'u3', regla);
      expect(agotada).toBe(AGOTADA);
    });

    it('debe rechazar reclamo duplicado del mismo usuario', async () => {
      await store.init('p1', 5, 60);
      const regla = { soloGanadores: false, puestos: 1, desde: 0 };

      await store.take('p1', 'u1', regla);
      const repetido = await store.take('p1', 'u1', regla);
      expect(repetido).toBe(YA_RECLAMADA);
    });

    it('debe validar condición soloGanadores', async () => {
      await store.init('p-winner', 5, 60);
      const regla = { soloGanadores: true, puestos: 3, desde: 1000 };

      // u1 no ha ganado
      const rechazo = await store.take('p-winner', 'u1', regla);
      expect(rechazo).toBe(NO_GANADOR);

      // Registrar puesto ganador
      await store.registrarPuesto('u1', 2, 1500);
      const aceptado = await store.take('p-winner', 'u1', regla);
      expect(aceptado).toBe(4);
    });

    it('debe devolver stock con release', async () => {
      await store.init('p1', 1, 60);
      const regla = { soloGanadores: false, puestos: 1, desde: 0 };

      await store.take('p1', 'u1', regla);
      await store.release('p1', 'u1');

      // Otro usuario debe poder tomarlo ahora
      const res = await store.take('p1', 'u2', regla);
      expect(res).toBe(0);
    });

    it('debe consultar múltiples stocks con getMany', async () => {
      await store.init('p1', 5, 60);
      await store.init('p2', 10, 60);

      const res = await store.getMany(['p1', 'p2', 'p3']);
      expect(res).toEqual([5, 10, null]);
    });

    it('debe avisar una sola vez al usuario', async () => {
      await store.init('p1', 2, 60);

      const primero = await store.avisarUnaVez('p1', 'u1');
      expect(primero).toBe(true);

      const segundo = await store.avisarUnaVez('p1', 'u1');
      expect(segundo).toBe(false);
    });

    it('debe descartar promos vencidas', async () => {
      await store.init('p-exp', 5, -1); // vence de inmediato
      const regla = { soloGanadores: false, puestos: 1, desde: 0 };
      const res = await store.take('p-exp', 'u1', regla);
      expect(res).toBe(AGOTADA);
    });
  });

  describe('RedisStockStore', () => {
    let store: RedisStockStore;

    beforeEach(() => {
      jest.clearAllMocks();
      store = new RedisStockStore('redis://localhost:6379');
    });

    it('debe definir comandos lua y conectar en constructor', () => {
      expect(mRedisInstance.defineCommand).toHaveBeenCalledWith('tomarUnidad', expect.any(Object));
      expect(mRedisInstance.defineCommand).toHaveBeenCalledWith('devolverUnidad', expect.any(Object));
      expect(mRedisInstance.defineCommand).toHaveBeenCalledWith('avisarUnaVez', expect.any(Object));
    });

    it('debe llamar set en init', async () => {
      await store.init('p1', 10, 120);
      expect(mRedisInstance.set).toHaveBeenCalledWith('promo:p1:stock', 10, 'EX', 120);
    });

    it('debe ejecutar comando tomarUnidad en take', async () => {
      mRedisInstance.tomarUnidad.mockResolvedValueOnce(3);
      const res = await store.take('p1', 'u1', { soloGanadores: true, puestos: 2, desde: 500 });
      expect(res).toBe(3);
      expect(mRedisInstance.tomarUnidad).toHaveBeenCalled();
    });

    it('debe ejecutar comando devolverUnidad en release', async () => {
      await store.release('p1', 'u1');
      expect(mRedisInstance.devolverUnidad).toHaveBeenCalledWith('promo:p1:stock', 'promo:p1:reclamos', 'u1');
    });

    it('debe manejar getMany con lista vacía o con elementos', async () => {
      const vacio = await store.getMany([]);
      expect(vacio).toEqual([]);

      mRedisInstance.mget.mockResolvedValueOnce(['5', null]);
      const res = await store.getMany(['p1', 'p2']);
      expect(res).toEqual([5, null]);
    });

    it('debe registrar puestos con multi zadd y zremrangebyscore', async () => {
      await store.registrarPuesto('u1', 1, 1000);
      expect(mRedisInstance.multi).toHaveBeenCalled();

      // Fuera de rango de puestos no debe hacer nada
      jest.clearAllMocks();
      await store.registrarPuesto('u1', 0, 1000);
      expect(mRedisInstance.multi).not.toHaveBeenCalled();
    });

    it('debe invocar avisarUnaVez en redis', async () => {
      mRedisInstance.avisarUnaVez.mockResolvedValueOnce(1);
      const res = await store.avisarUnaVez('p1', 'u1');
      expect(res).toBe(true);
    });

    it('debe cerrar conexión en onModuleDestroy', async () => {
      await store.onModuleDestroy();
      expect(mRedisInstance.quit).toHaveBeenCalled();
    });
  });

  describe('crearStockStore', () => {
    it('debe retornar RedisStockStore si redisUrl está configurada', () => {
      const mutableConfig = config as any;
      const prev = mutableConfig.redisUrl;
      mutableConfig.redisUrl = 'redis://localhost:6379';
      const store = crearStockStore();
      expect(store).toBeInstanceOf(RedisStockStore);
      mutableConfig.redisUrl = prev;
    });

    it('debe retornar MemoryStockStore si redisUrl está vacía', () => {
      const mutableConfig = config as any;
      const prev = mutableConfig.redisUrl;
      mutableConfig.redisUrl = '';
      const store = crearStockStore();
      expect(store).toBeInstanceOf(MemoryStockStore);
      mutableConfig.redisUrl = prev;
    });
  });
});
