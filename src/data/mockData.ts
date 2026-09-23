import { Establishment, PlanazoEvent, Promotion } from '../types';

export const INITIAL_ESTABLISHMENTS: Establishment[] = [
  {
    id: 'est-1',
    name: 'Gato Negro Bistro',
    zone: 'Zona G',
    category: 'Restaurantes',
    address: 'Calle 69A # 5-19, Chapinero',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
    capacity: 60,
    occupied: 42,
    description: 'Bistro de alta cocina de autor con ambiente acogedor y excelente maridaje de vinos en el corazón de la Zona G.',
    phone: '+57 310 555 0192',
    hours: '12:00 - 23:30'
  },
  {
    id: 'est-2',
    name: 'Andrés D.C.',
    zone: 'Zona T',
    category: 'Discotecas y Bares',
    address: 'Calle 82 # 12-21, Zona Rosa',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?auto=format&fit=crop&w=800&q=80',
    capacity: 250,
    occupied: 210,
    description: 'Icónica experiencia gastronómica y de rumba con 4 pisos temáticos: Infierno, Purgatorio, Tierra y Cielo.',
    phone: '+57 320 888 1234',
    hours: '12:00 - 03:00'
  },
  {
    id: 'est-3',
    name: 'La Villa Club',
    zone: 'Zona T',
    category: 'Discotecas y Bares',
    address: 'Carrera 14 # 83-53, Zona Rosa',
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1545128485-c400e7702796?auto=format&fit=crop&w=800&q=80',
    capacity: 180,
    occupied: 135,
    description: 'Famoso club de música electrónica, crossover y noches de intercambio de idiomas en Bogotá.',
    phone: '+57 312 444 9900',
    hours: '21:00 - 04:00'
  },
  {
    id: 'est-4',
    name: 'Criterion por Rausch',
    zone: 'Zona G',
    category: 'Restaurantes',
    address: 'Calle 69A # 5-75, Chapinero',
    rating: 4.9,
    image: 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80',
    capacity: 50,
    occupied: 38,
    description: 'Restaurante galardonado de alta gastronomía francesa moderna con técnicas contemporáneas.',
    phone: '+57 315 777 4321',
    hours: '12:30 - 22:30'
  },
  {
    id: 'est-5',
    name: 'Teatro Libre de Chapinero',
    zone: 'Zona G',
    category: 'Eventos',
    address: 'Calle 62 # 9-65, Chapinero',
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=800&q=80',
    capacity: 350,
    occupied: 280,
    description: 'Espacio cultural emblemático con obras teatrales, conciertos íntimos y espectáculos de comedia.',
    phone: '+57 301 222 3456',
    hours: '15:00 - 22:00'
  }
];

export const INITIAL_EVENTS: PlanazoEvent[] = [
  {
    id: 'evt-1',
    establishmentId: 'est-1',
    title: 'Noche de Jazz y Maridaje Francés',
    description: 'Cena degustación de 4 tiempos acompañada por un cuarteto de jazz en vivo y sommelier experto.',
    category: 'Gastronomía & Catas',
    date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
    startTime: '19:30',
    endTime: '22:30',
    maxCapacity: 30,
    bookedCapacity: 18,
    price: 120000,
    imageUrl: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80',
    status: 'Programado',
    createdAt: new Date().toISOString()
  },
  {
    id: 'evt-2',
    establishmentId: 'est-2',
    title: 'Viernes Loco: Fiesta TropiPop & Salsa Live',
    description: 'Grupo musical en vivo con lo mejor de la música colombiana, orquesta y sorpresas para grupos.',
    category: 'Fiesta / Noche',
    date: new Date(Date.now() + 172800000).toISOString().split('T')[0], // Day after tomorrow
    startTime: '21:00',
    endTime: '02:30',
    maxCapacity: 100,
    bookedCapacity: 75,
    price: 35000,
    imageUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80',
    status: 'Programado',
    createdAt: new Date().toISOString()
  },
  {
    id: 'evt-3',
    establishmentId: 'est-3',
    title: 'Gringo Tuesday & International Party',
    description: 'Intercambio cultural de idiomas de 4 a 8 PM seguido de la mejor fiesta internacional con DJs invitados.',
    category: 'Música en Vivo',
    date: new Date().toISOString().split('T')[0], // Today
    startTime: '17:00',
    endTime: '03:00',
    maxCapacity: 150,
    bookedCapacity: 120,
    price: 15000,
    imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
    status: 'En Vivo',
    createdAt: new Date().toISOString()
  }
];

export const INITIAL_PROMOTIONS: Promotion[] = [
  {
    id: 'prm-1',
    establishmentId: 'est-1',
    title: '2x1 en Cócteles de Autor de 5 a 8 PM',
    description: 'Disfruta de nuestros moxitos, gin tonics y mezcalas al 2x1 reservando desde Planazo.',
    discountPercentage: 50,
    discountCode: 'GATO2X1',
    initialStock: 15,
    currentStock: 8,
    expiresAt: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
    status: 'Activa',
    zone: 'Zona G',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prm-2',
    establishmentId: 'est-2',
    title: '30% Desc. en Plato Fuerte + Bebida de Bienvenida',
    description: 'Aplica para consumo individual o de parejas en horario almuerzo o cena temprana.',
    discountPercentage: 30,
    discountCode: 'ANDRES30',
    initialStock: 20,
    currentStock: 5,
    expiresAt: new Date(Date.now() + 14400000).toISOString(), // 4 hours from now
    status: 'Activa',
    zone: 'Zona T',
    createdAt: new Date().toISOString()
  },
  {
    id: 'prm-3',
    establishmentId: 'est-3',
    title: 'Free Cover + Shot de Tequila de Bienvenida',
    description: 'Válido para las primeras 50 personas que lleguen antes de las 10:30 PM.',
    discountPercentage: 100,
    discountCode: 'VILLAFREE',
    initialStock: 50,
    currentStock: 12,
    expiresAt: new Date(Date.now() + 10800000).toISOString(), // 3 hours from now
    status: 'Activa',
    zone: 'Zona T',
    createdAt: new Date().toISOString()
  }
];
