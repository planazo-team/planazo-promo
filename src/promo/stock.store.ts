import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Almacén del contador de stock de cada promoción (CC-1) y de quién ganó
 * partidas del minijuego (para las promociones "solo ganadores").
 *
 * La operación que importa es `take`: en UN paso indivisible comprueba que
 * la persona puede reclamar (no reclamó antes y, si la promo lo exige, ganó
 * una partida después del lanzamiento) y resta una unidad. Nadie puede
 * colarse entre la comprobación y la resta.
 */

/** Resultado de `take`: stock restante (>= 0) o el motivo del rechazo. */
export const AGOTADA = -1;
export const NO_GANADOR = -2;
export const YA_RECLAMADA = -3;

export interface ReglaReclamo {
  soloGanadores: boolean;
  /** Cuántos puestos del podio cuentan (1 a 3). */
  puestos: number;
  /** epoch ms: solo cuentan partidas terminadas desde este momento. */
  desde: number;
}

export interface StockStore {
  /** Crea el contador con su TTL igual a la duración de la promoción. */
  init(promoId: string, stock: number, ttlS: number): Promise<void>;
  /** Comprueba la regla y resta una unidad, todo indivisible. Ver AGOTADA, NO_GANADOR, YA_RECLAMADA. */
  take(promoId: string, userId: string, regla: ReglaReclamo): Promise<number>;
  /** Deshace un `take` (si después falló guardar el cupón). */
  release(promoId: string, userId: string): Promise<void>;
  /** Stock actual de varias promociones; `null` si el contador ya no existe. */
  getMany(promoIds: string[]): Promise<Array<number | null>>;
  /** Registra que `userId` quedó en el puesto `puesto` de una partida terminada en `at`. */
  registrarPuesto(userId: string, puesto: number, at: number): Promise<void>;
}

export const STOCK_STORE = 'planazo:stockStore';

/** Puestos que se registran: oro, plata y bronce. */
export const MAX_PUESTOS = 3;

const claveStock = (promoId: string) => `promo:${promoId}:stock`;
const claveReclamos = (promoId: string) => `promo:${promoId}:reclamos`;
const clavePuesto = (puesto: number) => `game:puesto:${puesto}`;

/** Las victorias se olvidan a los 3 días: una promo dura como mucho 24 h. */
const RETENCION_MS = 3 * 24 * 3600 * 1000;

/**
 * Script Lua: Redis lo ejecuta de forma indivisible.
 *
 * KEYS: 1 stock · 2 reclamos (set de usuarios) · 3..5 game:puesto:1..3 (zset usuario → epoch ms)
 * ARGV: 1 userId · 2 soloGanadores (1/0) · 3 puestos · 4 desde (epoch ms)
 *
 * Si el contador quedó bajo cero se deshace con INCR: el stock nunca es negativo.
 */
const TAKE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return -1
end
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  return -3
end
if ARGV[2] == '1' then
  local ok = false
  for i = 1, tonumber(ARGV[3]) do
    local s = redis.call('ZSCORE', KEYS[2 + i], ARGV[1])
    if s and tonumber(s) >= tonumber(ARGV[4]) then
      ok = true
      break
    end
  end
  if not ok then
    return -2
  end
end
local s = redis.call('DECR', KEYS[1])
if s < 0 then
  redis.call('INCR', KEYS[1])
  return -1
end
redis.call('SADD', KEYS[2], ARGV[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 then
  redis.call('PEXPIRE', KEYS[2], ttl)
end
return s
`;

/** Deshace un take: devuelve la unidad y borra al usuario de los reclamos. */
const RELEASE_LUA = `
if redis.call('SREM', KEYS[2], ARGV[1]) == 1 and redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('INCR', KEYS[1])
end
return 1
`;

interface RedisConScripts extends Redis {
  tomarUnidad(k1: string, k2: string, k3: string, k4: string, k5: string, ...argv: string[]): Promise<number>;
  devolverUnidad(k1: string, k2: string, userId: string): Promise<number>;
}

/** Implementación real: contador en Redis con decremento atómico por Lua. */
@Injectable()
export class RedisStockStore implements StockStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisStockStore.name);
  private readonly redis: RedisConScripts;

  constructor(url: string) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
    }) as RedisConScripts;
    this.redis.defineCommand('tomarUnidad', { numberOfKeys: 5, lua: TAKE_LUA });
    this.redis.defineCommand('devolverUnidad', { numberOfKeys: 2, lua: RELEASE_LUA });
    this.redis.on('error', (err: Error) => this.logger.error(`Redis de stock: ${err.message}`));
    this.logger.log('Stock de promociones en Redis (reclamo atómico con Lua).');
  }

  async init(promoId: string, stock: number, ttlS: number): Promise<void> {
    await this.redis.set(claveStock(promoId), stock, 'EX', Math.max(1, Math.ceil(ttlS)));
  }

  async take(promoId: string, userId: string, regla: ReglaReclamo): Promise<number> {
    return this.redis.tomarUnidad(
      claveStock(promoId),
      claveReclamos(promoId),
      clavePuesto(1),
      clavePuesto(2),
      clavePuesto(3),
      userId,
      regla.soloGanadores ? '1' : '0',
      String(Math.min(MAX_PUESTOS, Math.max(1, regla.puestos))),
      String(regla.desde),
    );
  }

  async release(promoId: string, userId: string): Promise<void> {
    await this.redis.devolverUnidad(claveStock(promoId), claveReclamos(promoId), userId);
  }

  async getMany(promoIds: string[]): Promise<Array<number | null>> {
    if (promoIds.length === 0) return [];
    const valores = await this.redis.mget(promoIds.map(claveStock));
    return valores.map((v) => (v === null ? null : Number(v)));
  }

  async registrarPuesto(userId: string, puesto: number, at: number): Promise<void> {
    if (puesto < 1 || puesto > MAX_PUESTOS) return;
    const clave = clavePuesto(puesto);
    // Guarda la victoria más reciente (GT) y poda las viejas.
    await this.redis
      .multi()
      .zadd(clave, 'GT', at, userId)
      .zremrangebyscore(clave, '-inf', Date.now() - RETENCION_MS)
      .exec();
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
  private readonly contadores = new Map<string, { stock: number; venceEn: number; reclamos: Set<string> }>();
  private readonly puestos = new Map<number, Map<string, number>>();

  async init(promoId: string, stock: number, ttlS: number): Promise<void> {
    this.contadores.set(promoId, { stock, venceEn: Date.now() + ttlS * 1000, reclamos: new Set() });
  }

  async take(promoId: string, userId: string, regla: ReglaReclamo): Promise<number> {
    const c = this.vigente(promoId);
    if (!c) return AGOTADA;
    if (c.reclamos.has(userId)) return YA_RECLAMADA;
    if (regla.soloGanadores) {
      let ok = false;
      for (let i = 1; i <= Math.min(MAX_PUESTOS, regla.puestos); i++) {
        const at = this.puestos.get(i)?.get(userId);
        if (at !== undefined && at >= regla.desde) ok = true;
      }
      if (!ok) return NO_GANADOR;
    }
    if (c.stock <= 0) return AGOTADA;
    c.stock -= 1;
    c.reclamos.add(userId);
    return c.stock;
  }

  async release(promoId: string, userId: string): Promise<void> {
    const c = this.vigente(promoId);
    if (c && c.reclamos.delete(userId)) c.stock += 1;
  }

  async getMany(promoIds: string[]): Promise<Array<number | null>> {
    return promoIds.map((id) => this.vigente(id)?.stock ?? null);
  }

  async registrarPuesto(userId: string, puesto: number, at: number): Promise<void> {
    if (puesto < 1 || puesto > MAX_PUESTOS) return;
    const m = this.puestos.get(puesto) ?? new Map<string, number>();
    m.set(userId, Math.max(at, m.get(userId) ?? 0));
    this.puestos.set(puesto, m);
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
