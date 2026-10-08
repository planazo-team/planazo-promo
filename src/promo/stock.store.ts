import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Almacén del contador de stock de cada promoción (CC-1).
 *
 * La única operación que importa es `take`: restar una unidad sin que dos
 * peticiones puedan restar la misma. Devuelve el stock restante, o -1 si ya
 * no quedaba nada (y entonces no resta).
 */
export interface StockStore {
  /** Crea el contador con su TTL igual a la duración de la promoción. */
  init(promoId: string, stock: number, ttlS: number): Promise<void>;
  /** Decremento indivisible. -1 = agotada (no se descontó nada). */
  take(promoId: string): Promise<number>;
  /** Stock actual de varias promociones; `null` si el contador ya no existe. */
  getMany(promoIds: string[]): Promise<Array<number | null>>;
}

export const STOCK_STORE = 'planazo:stockStore';

/**
 * Script Lua: Redis lo ejecuta de forma indivisible, nadie se cuela entre el
 * DECR y la comprobación. Si el contador quedó bajo cero se deshace con INCR,
 * así el stock nunca es negativo.
 */
const TAKE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return -1
end
local s = redis.call('DECR', KEYS[1])
if s < 0 then
  redis.call('INCR', KEYS[1])
  return -1
end
return s
`;

const clave = (promoId: string) => `promo:${promoId}:stock`;

interface RedisConTake extends Redis {
  tomarUnidad(key: string): Promise<number>;
}

/** Implementación real: contador en Redis con decremento atómico por Lua. */
@Injectable()
export class RedisStockStore implements StockStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisStockStore.name);
  private readonly redis: RedisConTake;

  constructor(url: string) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
    }) as RedisConTake;
    this.redis.defineCommand('tomarUnidad', { numberOfKeys: 1, lua: TAKE_LUA });
    this.redis.on('error', (err: Error) => this.logger.error(`Redis de stock: ${err.message}`));
    this.logger.log('Stock de promociones en Redis (decremento atómico con Lua).');
  }

  async init(promoId: string, stock: number, ttlS: number): Promise<void> {
    await this.redis.set(clave(promoId), stock, 'EX', Math.max(1, Math.ceil(ttlS)));
  }

  async take(promoId: string): Promise<number> {
    return this.redis.tomarUnidad(clave(promoId));
  }

  async getMany(promoIds: string[]): Promise<Array<number | null>> {
    if (promoIds.length === 0) return [];
    const valores = await this.redis.mget(promoIds.map(clave));
    return valores.map((v) => (v === null ? null : Number(v)));
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

/**
 * Implementación en memoria para desarrollo y tests, sin Redis. La
 * comprobación y la resta ocurren en el mismo paso síncrono, así que dentro
 * de un proceso de Node es igual de indivisible que el script Lua.
 */
@Injectable()
export class MemoryStockStore implements StockStore {
  private readonly contadores = new Map<string, { stock: number; venceEn: number }>();

  async init(promoId: string, stock: number, ttlS: number): Promise<void> {
    this.contadores.set(promoId, { stock, venceEn: Date.now() + ttlS * 1000 });
  }

  async take(promoId: string): Promise<number> {
    const c = this.vigente(promoId);
    if (!c || c.stock <= 0) return -1;
    c.stock -= 1;
    return c.stock;
  }

  async getMany(promoIds: string[]): Promise<Array<number | null>> {
    return promoIds.map((id) => this.vigente(id)?.stock ?? null);
  }

  private vigente(promoId: string) {
    const c = this.contadores.get(promoId);
    if (!c) return undefined;
    if (c.venceEn <= Date.now()) {
      this.contadores.delete(promoId);
      return undefined;
    }
    return c;
  }
}

/** Elige Redis si hay REDIS_URL; si no, memoria (y lo deja claro en el log). */
export function crearStockStore(): StockStore {
  if (config.redisUrl) return new RedisStockStore(config.redisUrl);
  new Logger('StockStore').warn('REDIS_URL no está definida: el stock vive en memoria (solo desarrollo).');
  return new MemoryStockStore();
}
