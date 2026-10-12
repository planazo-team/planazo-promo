import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { config } from '../config';
import { CATALOGO } from './catalogo';
import type { CatalogPlace, Coupon, Promo, Zone } from './promo.types';

/**
 * Lo que promo guarda fuera de Redis: promociones lanzadas, cupones
 * entregados, el catálogo de lugares (los 12 semilla + los que crean los
 * negocios, que llegan por el bus) y el historial de puestos del minijuego.
 *
 * El stock NO vive aquí: vive en Redis y solo se toca con el script Lua.
 * Esto es la memoria a largo plazo: lo que debe sobrevivir a un redespliegue.
 */

export type StoredCoupon = Coupon & { userId: string };

export interface PromoRepo {
  init(): Promise<void>;
  catalogo(placeId: string): Promise<CatalogPlace | null>;
  guardarLugar(p: CatalogPlace): Promise<void>;
  guardarPromo(p: Promo): Promise<void>;
  promo(id: string): Promise<Promo | null>;
  /** Las que no han vencido (`expiresAt > ahora`). */
  promosVigentes(ahora: number): Promise<Promo[]>;
  /** Inserta el cupón; `false` si ese usuario ya tenía cupón de esa promo. */
  guardarCupon(c: StoredCoupon): Promise<boolean>;
  cuponesDe(userId: string): Promise<Coupon[]>;
  cuponesEntregados(promoId: string): Promise<number>;
  guardarPuesto(userId: string, puesto: number, at: number, salaId: string): Promise<void>;
  /** Puestos recientes, para reconstruir Redis si se vació. */
  puestosDesde(desde: number): Promise<Array<{ userId: string; puesto: number; at: number }>>;
  close?(): Promise<void>;
}

export const PROMO_REPO = 'planazo:promoRepo';

/* ------------------------------------------------------------------ */
/* memoria                                                             */
/* ------------------------------------------------------------------ */

export class MemoryPromoRepo implements PromoRepo {
  private readonly lugares = new Map<string, CatalogPlace>(
    Object.entries(CATALOGO).map(([id, v]) => [id, { id, name: v.name, zone: v.zone }]),
  );
  private readonly promos = new Map<string, Promo>();
  private readonly cupones: StoredCoupon[] = [];
  private readonly puestos: Array<{ userId: string; puesto: number; at: number }> = [];

  async init() {}
  async catalogo(placeId: string) {
    return this.lugares.get(placeId) ?? null;
  }
  async guardarLugar(p: CatalogPlace) {
    this.lugares.set(p.id, { ...p });
  }
  async guardarPromo(p: Promo) {
    this.promos.set(p.id, { ...p });
  }
  async promo(id: string) {
    const p = this.promos.get(id);
    return p ? { ...p } : null;
  }
  async promosVigentes(ahora: number) {
    return [...this.promos.values()].filter((p) => p.expiresAt > ahora).map((p) => ({ ...p }));
  }
  async guardarCupon(c: StoredCoupon) {
    if (this.cupones.some((x) => x.promoId === c.promoId && x.userId === c.userId)) return false;
    this.cupones.push({ ...c });
    return true;
  }
  async cuponesDe(userId: string) {
    return this.cupones
      .filter((c) => c.userId === userId)
      .map(({ userId: _u, ...c }) => c)
      .sort((a, b) => b.claimedAt - a.claimedAt);
  }
  async cuponesEntregados(promoId: string) {
    return this.cupones.filter((c) => c.promoId === promoId).length;
  }
  async guardarPuesto(userId: string, puesto: number, at: number) {
    this.puestos.push({ userId, puesto, at });
  }
  async puestosDesde(desde: number) {
    return this.puestos.filter((p) => p.at >= desde);
  }
}

/* ------------------------------------------------------------------ */
/* PostgreSQL                                                          */
/* ------------------------------------------------------------------ */

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS promo;

CREATE TABLE IF NOT EXISTS promo.lugares (
  id   text PRIMARY KEY,
  name text NOT NULL,
  zone text NOT NULL
);

CREATE TABLE IF NOT EXISTS promo.promos (
  id             uuid PRIMARY KEY,
  place_id       text NOT NULL,
  place_name     text NOT NULL,
  zone           text NOT NULL,
  title          text NOT NULL,
  discount       text NOT NULL,
  initial_stock  integer NOT NULL CHECK (initial_stock > 0),
  expires_at     bigint NOT NULL,
  launched_at    bigint NOT NULL,
  solo_ganadores boolean NOT NULL DEFAULT false,
  puestos        smallint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS promos_vigentes_idx ON promo.promos(expires_at);

CREATE TABLE IF NOT EXISTS promo.cupones (
  id         uuid PRIMARY KEY,
  promo_id   uuid NOT NULL REFERENCES promo.promos(id),
  code       text NOT NULL UNIQUE,
  title      text NOT NULL,
  discount   text NOT NULL,
  place_name text NOT NULL,
  claimed_at bigint NOT NULL,
  user_id    text NOT NULL,
  CONSTRAINT un_cupon_por_persona UNIQUE (promo_id, user_id)
);
CREATE INDEX IF NOT EXISTS cupones_user_idx ON promo.cupones(user_id);

CREATE TABLE IF NOT EXISTS promo.puestos (
  user_id text NOT NULL,
  puesto  smallint NOT NULL,
  at      bigint NOT NULL,
  sala_id text NOT NULL,
  PRIMARY KEY (user_id, puesto, at)
);
CREATE INDEX IF NOT EXISTS puestos_at_idx ON promo.puestos(at);
`;

type Row = Record<string, unknown>;

const toPromo = (r: Row): Promo => ({
  id: String(r.id),
  placeId: String(r.place_id),
  placeName: String(r.place_name),
  zone: r.zone as Zone,
  title: String(r.title),
  discount: String(r.discount),
  stock: Number(r.initial_stock),
  initialStock: Number(r.initial_stock),
  expiresAt: Number(r.expires_at),
  launchedAt: Number(r.launched_at),
  soloGanadores: Boolean(r.solo_ganadores),
  puestos: Number(r.puestos),
});

export class PgPromoRepo implements PromoRepo {
  private readonly logger = new Logger(PgPromoRepo.name);
  private readonly pool: Pool;

  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 10) });
    this.pool.on('error', (err) => this.logger.error(`PostgreSQL: ${err.message}`));
  }

  async init() {
    const c = await this.pool.connect();
    try {
      await c.query(`SELECT pg_advisory_lock(hashtext('planazo-promo-init'))`);
      await c.query(SCHEMA);
      for (const [id, v] of Object.entries(CATALOGO)) {
        await c.query('INSERT INTO promo.lugares (id, name, zone) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING', [
          id,
          v.name,
          v.zone,
        ]);
      }
      this.logger.log('Esquema promo listo (PostgreSQL).');
    } finally {
      await c.query(`SELECT pg_advisory_unlock(hashtext('planazo-promo-init'))`).catch(() => undefined);
      c.release();
    }
  }

  async catalogo(placeId: string) {
    const { rows } = await this.pool.query('SELECT id, name, zone FROM promo.lugares WHERE id = $1', [placeId]);
    return rows[0] ? { id: String(rows[0].id), name: String(rows[0].name), zone: rows[0].zone as Zone } : null;
  }

  async guardarLugar(p: CatalogPlace) {
    await this.pool.query(
      `INSERT INTO promo.lugares (id, name, zone) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, zone = EXCLUDED.zone`,
      [p.id, p.name, p.zone],
    );
  }

  async guardarPromo(p: Promo) {
    await this.pool.query(
      `INSERT INTO promo.promos (id, place_id, place_name, zone, title, discount, initial_stock, expires_at, launched_at, solo_ganadores, puestos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [p.id, p.placeId, p.placeName, p.zone, p.title, p.discount, p.initialStock, p.expiresAt, p.launchedAt, p.soloGanadores, p.puestos],
    );
  }

  async promo(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows } = await this.pool.query('SELECT * FROM promo.promos WHERE id = $1', [id]);
    return rows[0] ? toPromo(rows[0]) : null;
  }

  async promosVigentes(ahora: number) {
    const { rows } = await this.pool.query('SELECT * FROM promo.promos WHERE expires_at > $1 ORDER BY expires_at', [ahora]);
    return rows.map(toPromo);
  }

  async guardarCupon(c: StoredCoupon) {
    const r = await this.pool.query(
      `INSERT INTO promo.cupones (id, promo_id, code, title, discount, place_name, claimed_at, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (promo_id, user_id) DO NOTHING`,
      [c.id, c.promoId, c.code, c.title, c.discount, c.placeName, c.claimedAt, c.userId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async cuponesDe(userId: string) {
    const { rows } = await this.pool.query(
      'SELECT * FROM promo.cupones WHERE user_id = $1 ORDER BY claimed_at DESC LIMIT 200',
      [userId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      promoId: String(r.promo_id),
      code: String(r.code),
      title: String(r.title),
      discount: String(r.discount),
      placeName: String(r.place_name),
      claimedAt: Number(r.claimed_at),
    }));
  }

  async cuponesEntregados(promoId: string) {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM promo.cupones WHERE promo_id = $1', [promoId]);
    return Number(rows[0].n);
  }

  async guardarPuesto(userId: string, puesto: number, at: number, salaId: string) {
    await this.pool.query(
      'INSERT INTO promo.puestos (user_id, puesto, at, sala_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [userId, puesto, at, salaId],
    );
  }

  async puestosDesde(desde: number) {
    const { rows } = await this.pool.query('SELECT user_id, puesto, at FROM promo.puestos WHERE at >= $1', [desde]);
    return rows.map((r) => ({ userId: String(r.user_id), puesto: Number(r.puesto), at: Number(r.at) }));
  }

  async close() {
    await this.pool.end();
  }
}

/** Con DATABASE_URL, PostgreSQL; sin ella, memoria (y lo deja claro en el log). */
export function crearPromoRepo(): PromoRepo {
  if (config.databaseUrl) return new PgPromoRepo(config.databaseUrl);
  new Logger('PromoRepo').warn('DATABASE_URL no está definida: promociones y cupones viven en memoria.');
  return new MemoryPromoRepo();
}
