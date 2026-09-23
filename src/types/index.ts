export type Zone = 'Zona G' | 'Zona T';

export type Category = 
  | 'Restaurantes' 
  | 'Discotecas y Bares' 
  | 'Eventos' 
  | 'Lugares de Interés' 
  | 'Hoteles';

export type EventCategory = 
  | 'Música en Vivo' 
  | 'Gastronomía & Catas' 
  | 'Fiesta / Noche' 
  | 'Cultural / Arte' 
  | 'Especial';

export interface Establishment {
  id: string;
  name: string;
  zone: Zone;
  category: Category;
  address: string;
  rating: number;
  image: string;
  capacity: number;
  occupied: number;
  description: string;
  phone: string;
  hours: string;
}

export interface PlanazoEvent {
  id: string;
  establishmentId: string;
  title: string;
  description: string;
  category: EventCategory;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  maxCapacity: number;
  bookedCapacity: number;
  price: number;
  imageUrl?: string;
  status: 'Programado' | 'En Vivo' | 'Finalizado';
  createdAt: string;
}

export interface Promotion {
  id: string;
  establishmentId: string;
  title: string;
  description: string;
  discountPercentage?: number;
  discountCode: string;
  initialStock: number;
  currentStock: number;
  expiresAt: string; // ISO String
  status: 'Activa' | 'Agotada' | 'Expirada' | 'Pausada';
  zone: Zone;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'promo' | 'event';
  timestamp: string;
  read: boolean;
  zone: Zone;
  placeName?: string;
  linkId?: string;
}

export type UserRole = 'establishment' | 'customer';

export interface FilterOptions {
  zone: Zone | 'Todas';
  category: Category | 'Todas';
  searchQuery: string;
  onlyWithPromos: boolean;
  onlyWithEvents: boolean;
  occupancyFilter: 'todas' | 'disponible' | 'media' | 'lleno';
}
