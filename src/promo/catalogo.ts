import type { Zone } from './promo.types';

/**
 * Nombre y zona de cada establecimiento del piloto. Es una copia del catálogo
 * semilla de booking (planazo-booking/src/booking/seed.ts): promo no llama a
 * booking para resolverlo porque ningún servicio le pide nada a otro, y el
 * catálogo del MVP es fijo (12 lugares, dos zonas).
 */
export const CATALOGO: Readonly<Record<string, { name: string; zone: Zone }>> = {
  p1: { name: 'Fideos de la Nona', zone: 'zona-g' },
  p2: { name: 'Casa Olivo', zone: 'zona-g' },
  p3: { name: 'Mercado de Dumplings', zone: 'zona-g' },
  p4: { name: 'Café Rota', zone: 'zona-g' },
  p5: { name: 'La Terraza de Quinta', zone: 'zona-g' },
  p6: { name: 'Hotel Quinta Camacho', zone: 'zona-g' },
  p7: { name: 'Bar El Zaguán', zone: 'zona-t' },
  p8: { name: 'Terraza 85', zone: 'zona-t' },
  p9: { name: 'Club Salvaje', zone: 'zona-t' },
  p10: { name: 'Stand-up en la 83', zone: 'zona-t' },
  p11: { name: 'Hotel 82', zone: 'zona-t' },
  p12: { name: 'Parque El Virrey', zone: 'zona-t' },
};
