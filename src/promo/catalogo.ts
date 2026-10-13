import type { Zone } from './promo.types';

/**
 * Nombre y zona de cada establecimiento del piloto. Es una copia del catálogo
 * semilla de booking (planazo-booking/src/booking/seed.ts): promo no llama a
 * booking para resolverlo porque ningún servicio le pide nada a otro, y el
 * catálogo del MVP es fijo (29 lugares, dos zonas).
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
  p13: { name: 'Parque de la 93', zone: 'zona-t' },
  p14: { name: 'Parque Japón', zone: 'zona-t' },
  p15: { name: 'Sendero Quebrada La Vieja', zone: 'zona-g' },
  p16: { name: 'Parque de los Hippies', zone: 'zona-g' },
  p17: { name: 'Parque El Chicó', zone: 'zona-t' },
  p18: { name: 'Ciclovía de la Séptima', zone: 'zona-g' },
  p19: { name: 'Tejo El Turmequé', zone: 'zona-g' },
  p20: { name: 'La Azotea de la 70', zone: 'zona-g' },
  p21: { name: 'Cervecería Los Cerros', zone: 'zona-g' },
  p22: { name: 'La Ficha · juegos de mesa', zone: 'zona-g' },
  p23: { name: 'Karaoke El Gritón', zone: 'zona-t' },
  p24: { name: 'Salsa Caleña 82', zone: 'zona-t' },
  p25: { name: 'Food trucks de la 85', zone: 'zona-t' },
  p26: { name: 'Brunch Club 70', zone: 'zona-g' },
  p27: { name: 'Café Lectura Quinta', zone: 'zona-g' },
  p28: { name: 'Cine bajo las estrellas', zone: 'zona-t' },
  p29: { name: 'Arepas La Esquina', zone: 'zona-g' },
};
