// Tipos del contrato con el frontend (planazo-frontend/frontend/src/lib/types.ts
// y planazo-infra/contracts/http.md). Si cambian allá, cambian aquí.

export type Zone = 'zona-g' | 'zona-t';

/** Promoción de stock finito. `expiresAt` en epoch milisegundos. */
export interface Promo {
  id: string;
  placeId: string;
  placeName: string;
  zone: Zone;
  title: string;
  discount: string;
  /** Unidades que quedan. Lo mantiene el almacén de stock (Redis), no este objeto. */
  stock: number;
  initialStock: number;
  expiresAt: number;
  /** Cuándo se lanzó (epoch ms). Para las de ganadores, solo cuentan partidas terminadas después. */
  launchedAt: number;
  /**
   * Si es `true`, solo la reclaman quienes quedaron entre los primeros `puestos`
   * de una partida del minijuego terminada después del lanzamiento.
   */
  soloGanadores: boolean;
  /** 1 = solo el ganador; 3 = podio. Solo aplica si `soloGanadores`. */
  puestos: number;
}

/** Cupón entregado a un usuario tras un claim exitoso. */
export interface Coupon {
  id: string;
  promoId: string;
  code: string;
  title: string;
  discount: string;
  placeName: string;
  /** epoch ms */
  claimedAt: number;
}

/** Cuerpo de POST /promos. */
export interface LaunchPromoInput {
  placeId: string;
  title: string;
  discount: string;
  stock: number;
  durationS: number;
  soloGanadores?: boolean;
  puestos?: number;
  /** Solo se usan si el lugar todavía no está en el catálogo de promo (ver PromoService.launch). */
  placeName?: string;
  zone?: Zone;
}

/** Fila del catálogo que promo conoce: nombre y zona de cada lugar. */
export interface CatalogPlace {
  id: string;
  name: string;
  zone: Zone;
}

/** Línea de puntaje de GAME.PARTIDA_FINALIZADA (planazo-game, PartidaFinalizadaEventData). */
export interface LineaPuntaje {
  jugadorId: string;
  jugadorNombre: string;
  puntaje: number;
  posicionFinal: number;
  sobrevivio: boolean;
}

export interface PartidaFinalizada {
  salaId: string;
  salaCodigo: string;
  ganadorJugadorId: string | null;
  ganadorJugadorNombre: string | null;
  puntajes: LineaPuntaje[];
  finalizadaEn: string | number;
}
