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
}
