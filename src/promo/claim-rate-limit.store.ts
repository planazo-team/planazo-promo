import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Límite de tasa de POST /promos/:id/claim (CC-1: "limitación de tasa en
 * reclamo"), para frenar bots que acaparan cupones a fuerza de reintentos.
 * Se cuenta por `userId` (la identidad que ya exige el gateway), no por IP:
 * es la misma clave con la que el stock ya deduplica reclamos, y evita que
 * varios clientes detrás de un mismo NAT se bloqueen entre sí.
 *
 * Ventana fija (no deslizante): en 2 réplicas el contador vive en Redis
 * (igual que el stock en `stock.store.ts`), así ambas comparten el mismo
 * cupo sin importar cuál atienda cada intento.
 */
export interface ClaimRateLimitStore {
  /**
   * Registra un intento y dice si hay que rechazarlo.
   * `reintentarEnS` es cuánto falta para que la ventana actual expire.
   */
  hit(userId: string, maxIntentos: number, ventanaS: number): Promise<{ limitado: boolean; reintentarEnS: number }>;
}

export const CLAIM_RATE_LIMIT_STORE = 'planazo:claimRateLimitStore';

const clave = (userId: string) => `promo:ratelimit:claim:${userId}`;

/**
 * Script Lua: incrementa y, si es el primer intento de la ventana, le pone
 * el TTL. Indivisible, así dos réplicas incrementando al mismo tiempo no
 * dejan pasar más intentos de los debidos.
 *
 * KEYS[1] contador · ARGV[1] ventana en segundos.
 * Devuelve [cuenta, ttl restante en ms].
 */
const HIT_LUA = `
local cuenta = redis.call('INCR', KEYS[1])
if cuenta == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]) * 1000)
end
local ttl = redis.call('PTTL', KEYS[1])
return {cuenta, ttl}
`;

interface RedisConScript extends Redis {
  registrarIntento(k1: string, ventanaS: string): Promise<[number, number]>;
}

@Injectable()
export class RedisClaimRateLimitStore implements ClaimRateLimitStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisClaimRateLimitStore.name);
  private readonly redis: RedisConScript;

  constructor(url: string) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
    }) as RedisConScript;
    this.redis.defineCommand('registrarIntento', { numberOfKeys: 1, lua: HIT_LUA });
    this.redis.on('error', (err: Error) => this.logger.error(`Redis de límite de reclamo: ${err.message}`));
  }

  async hit(userId: string, maxIntentos: number, ventanaS: number): Promise<{ limitado: boolean; reintentarEnS: number }> {
    const [cuenta, ttlMs] = await this.redis.registrarIntento(clave(userId), String(ventanaS));
    const reintentarEnS = Math.max(1, Math.ceil(ttlMs / 1000));
    return { limitado: cuenta > maxIntentos, reintentarEnS };
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
 * Implementación en memoria para desarrollo y tests, sin Redis. Sirve solo a
 * un proceso (si hay varias réplicas sin Redis, cada una cuenta aparte), por
 * eso `crearClaimRateLimitStore` avisa igual que `crearStockStore`.
 */
@Injectable()
export class MemoryClaimRateLimitStore implements ClaimRateLimitStore {
  private readonly contadores = new Map<string, { cuenta: number; venceEn: number }>();

  async hit(userId: string, maxIntentos: number, ventanaS: number): Promise<{ limitado: boolean; reintentarEnS: number }> {
    const ahora = Date.now();
    const actual = this.contadores.get(userId);
    const vigente = actual && actual.venceEn > ahora ? actual : { cuenta: 0, venceEn: ahora + ventanaS * 1000 };
    vigente.cuenta += 1;
    this.contadores.set(userId, vigente);
    return { limitado: vigente.cuenta > maxIntentos, reintentarEnS: Math.max(1, Math.ceil((vigente.venceEn - ahora) / 1000)) };
  }
}

/** Elige Redis si hay REDIS_URL; si no, memoria (y lo deja claro en el log), igual que el stock. */
export function crearClaimRateLimitStore(): ClaimRateLimitStore {
  if (config.redisUrl) return new RedisClaimRateLimitStore(config.redisUrl);
  new Logger('ClaimRateLimitStore').warn('REDIS_URL no está definida: el límite de reclamo vive en memoria (solo desarrollo).');
  return new MemoryClaimRateLimitStore();
}
