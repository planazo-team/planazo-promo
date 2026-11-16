import { MemoryClaimRateLimitStore, RedisClaimRateLimitStore, crearClaimRateLimitStore } from './claim-rate-limit.store';
import { config } from '../config';

const mRedisInstance = {
  defineCommand: jest.fn(),
  on: jest.fn(),
  registrarIntento: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn(() => mRedisInstance);
});

describe('ClaimRateLimitStore', () => {
  describe('MemoryClaimRateLimitStore', () => {
    let store: MemoryClaimRateLimitStore;

    beforeEach(() => {
      store = new MemoryClaimRateLimitStore();
    });

    it('deja pasar los intentos hasta el máximo', async () => {
      const r1 = await store.hit('u1', 2, 60);
      expect(r1.limitado).toBe(false);
      const r2 = await store.hit('u1', 2, 60);
      expect(r2.limitado).toBe(false);
    });

    it('bloquea a partir del intento que excede el máximo', async () => {
      await store.hit('u1', 2, 60);
      await store.hit('u1', 2, 60);
      const r3 = await store.hit('u1', 2, 60);
      expect(r3.limitado).toBe(true);
      expect(r3.reintentarEnS).toBeGreaterThan(0);
    });

    it('cuenta cada usuario por separado', async () => {
      await store.hit('u1', 1, 60);
      const otro = await store.hit('u2', 1, 60);
      expect(otro.limitado).toBe(false);
    });

    it('reinicia la cuenta cuando la ventana ya expiró', async () => {
      const ahoraReal = Date.now;
      let t = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => t);

      await store.hit('u1', 1, 1); // ventana de 1s
      t += 1_500; // expira
      const r = await store.hit('u1', 1, 1);
      expect(r.limitado).toBe(false);

      Date.now = ahoraReal;
    });
  });

  describe('RedisClaimRateLimitStore', () => {
    let store: RedisClaimRateLimitStore;

    beforeEach(() => {
      jest.clearAllMocks();
      store = new RedisClaimRateLimitStore('redis://localhost:6379');
    });

    it('define el script y no limita cuando la cuenta no supera el máximo', async () => {
      mRedisInstance.registrarIntento.mockResolvedValueOnce([3, 45_000]);
      const r = await store.hit('u1', 5, 60);
      expect(mRedisInstance.defineCommand).toHaveBeenCalledWith('registrarIntento', expect.objectContaining({ numberOfKeys: 1 }));
      expect(r).toEqual({ limitado: false, reintentarEnS: 45 });
    });

    it('limita cuando la cuenta supera el máximo', async () => {
      mRedisInstance.registrarIntento.mockResolvedValueOnce([6, 12_345]);
      const r = await store.hit('u1', 5, 60);
      expect(r.limitado).toBe(true);
      expect(r.reintentarEnS).toBe(13);
    });

    it('cierra la conexión en destroy', async () => {
      await store.onModuleDestroy();
      expect(mRedisInstance.quit).toHaveBeenCalled();
    });
  });

  describe('crearClaimRateLimitStore', () => {
    const original = config.redisUrl;

    afterEach(() => {
      (config as { redisUrl?: string }).redisUrl = original;
    });

    it('usa Redis si hay REDIS_URL', () => {
      (config as { redisUrl?: string }).redisUrl = 'redis://localhost:6379';
      expect(crearClaimRateLimitStore()).toBeInstanceOf(RedisClaimRateLimitStore);
    });

    it('usa memoria si no hay REDIS_URL', () => {
      (config as { redisUrl?: string }).redisUrl = undefined;
      expect(crearClaimRateLimitStore()).toBeInstanceOf(MemoryClaimRateLimitStore);
    });
  });
});
