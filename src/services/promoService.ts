import { Promotion, Zone, AppNotification } from '../types';
import { INITIAL_PROMOTIONS } from '../data/mockData';

export interface DomainEvent {
  type: 'PROMO.PUSH' | 'PROMO.WON' | 'PROMO.REJECTED' | 'PROMO.EXPIRED' | 'EVENT.NEW';
  seq: number;
  timestamp: string;
  data: any;
}

export interface UserCoupon {
  id: string;
  promoId: string;
  promoTitle: string;
  userId: string;
  code: string;
  redeemedAt: string;
}

class PromoService {
  private promotions: Map<string, Promotion> = new Map();
  private userCoupons: Map<string, UserCoupon[]> = new Map();
  private notifications: AppNotification[] = [];
  private eventLog: DomainEvent[] = [];
  private globalSeq = 0;
  private locks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.seed();
  }

  public seed() {
    this.promotions.clear();
    this.userCoupons.clear();
    INITIAL_PROMOTIONS.forEach(p => {
      this.promotions.set(p.id, { ...p });
    });

    this.notifications = [
      {
        id: 'notif-1',
        title: '⚡ ¡Nueva Oferta en Zona G!',
        message: 'Gato Negro Bistro acaba de lanzar 2x1 en cócteles de autor. ¡Quedan 8 cupos!',
        type: 'promo',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        read: false,
        zone: 'Zona G',
        placeName: 'Gato Negro Bistro',
        linkId: 'prm-1'
      },
      {
        id: 'notif-2',
        title: '🎉 Noche de Jazz Confirmada',
        message: 'Se ha programado "Noche de Jazz y Maridaje Francés" para mañana a las 19:30.',
        type: 'event',
        timestamp: new Date(Date.now() - 900000).toISOString(),
        read: false,
        zone: 'Zona G',
        placeName: 'Gato Negro Bistro',
        linkId: 'evt-1'
      }
    ];
  }

  private emitEvent(type: DomainEvent['type'], data: any): DomainEvent {
    this.globalSeq += 1;
    const event: DomainEvent = {
      type,
      seq: this.globalSeq,
      timestamp: new Date().toISOString(),
      data
    };
    this.eventLog.push(event);
    return event;
  }

  public getEventLog(): DomainEvent[] {
    return [...this.eventLog];
  }

  // --- NOTIFICATIONS (HU-89 & HU-90) ---
  public getNotifications(): AppNotification[] {
    return [...this.notifications].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public markNotificationAsRead(id: string) {
    this.notifications = this.notifications.map(n => n.id === id ? { ...n, read: true } : n);
  }

  public markAllNotificationsAsRead() {
    this.notifications = this.notifications.map(n => ({ ...n, read: true }));
  }

  public addNotification(n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): AppNotification {
    const notification: AppNotification = {
      ...n,
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      read: false
    };
    this.notifications.unshift(notification);
    return notification;
  }

  // GET /promos/mine — Cupones del usuario
  public getUserCoupons(userId: string): UserCoupon[] {
    return this.userCoupons.get(userId) || [];
  }

  // GET /promos & /promos/place/:placeId (HU-17)
  public getPromotions(options?: { placeId?: string; zone?: string; activeOnly?: boolean }): Promotion[] {
    const now = Date.now();
    let list = Array.from(this.promotions.values());

    list = list.map(p => {
      const expTime = new Date(p.expiresAt).getTime();
      if (expTime <= now && p.status === 'Activa') {
        p.status = 'Expirada';
        this.emitEvent('PROMO.EXPIRED', { promoId: p.id, title: p.title });
      } else if (p.currentStock <= 0 && p.status === 'Activa') {
        p.status = 'Agotada';
      }
      return p;
    });

    if (options?.placeId) {
      list = list.filter(p => p.establishmentId === options.placeId);
    }

    if (options?.zone && options.zone !== 'Todas') {
      list = list.filter(p => p.zone === options.zone);
    }

    if (options?.activeOnly) {
      list = list.filter(p => p.status === 'Activa');
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getPromotionById(id: string): Promotion | undefined {
    return this.getPromotions().find(p => p.id === id);
  }

  // POST /promos (HU-26)
  public createPromotion(
    placeId: string,
    zone: Zone,
    data: {
      title: string;
      description: string;
      discountPercentage?: number;
      discountCode: string;
      initialStock: number;
      expiresAt: string;
      placeName?: string;
    }
  ): { success: boolean; promo?: Promotion; error?: string; code?: string } {
    if (!data.title || data.title.trim().length === 0) {
      return { success: false, error: 'El título de la promoción es obligatorio.', code: 'INVALID_TITLE' };
    }
    if (!data.description || data.description.trim().length === 0) {
      return { success: false, error: 'La descripción es obligatoria.', code: 'INVALID_DESCRIPTION' };
    }
    if (!data.discountCode || data.discountCode.trim().length === 0) {
      return { success: false, error: 'El código de cupón es obligatorio.', code: 'INVALID_CODE' };
    }
    if (!data.initialStock || data.initialStock <= 0) {
      return { success: false, error: 'El stock/cupos disponibles debe ser mayor a 0.', code: 'INVALID_STOCK' };
    }
    if (!data.expiresAt) {
      return { success: false, error: 'La fecha de expiración es obligatoria.', code: 'INVALID_EXPIRATION' };
    }

    const newPromo: Promotion = {
      id: `prm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      establishmentId: placeId,
      title: data.title.trim(),
      description: data.description.trim(),
      discountPercentage: data.discountPercentage,
      discountCode: data.discountCode.trim().toUpperCase(),
      initialStock: Number(data.initialStock),
      currentStock: Number(data.initialStock),
      expiresAt: data.expiresAt,
      status: 'Activa',
      zone: zone,
      createdAt: new Date().toISOString()
    };

    this.promotions.set(newPromo.id, newPromo);

    this.emitEvent('PROMO.PUSH', {
      promoId: newPromo.id,
      placeId: newPromo.establishmentId,
      zone: newPromo.zone,
      title: newPromo.title
    });

    this.addNotification({
      title: `⚡ ¡Nueva Oferta en ${zone}!`,
      message: `${data.placeName || 'Un establecimiento'} ha lanzado: "${newPromo.title}" (${newPromo.currentStock} cupos)`,
      type: 'promo',
      zone: zone,
      placeName: data.placeName,
      linkId: newPromo.id
    });

    return { success: true, promo: newPromo };
  }

  // PUT /promos/:id (HU-69 Update Promo)
  public updatePromotion(id: string, data: Partial<Promotion>): { success: boolean; promo?: Promotion; error?: string } {
    const promo = this.promotions.get(id);
    if (!promo) return { success: false, error: 'La promoción no fue encontrada.' };

    const updated: Promotion = {
      ...promo,
      ...data,
      title: data.title ? data.title.trim() : promo.title,
      description: data.description ? data.description.trim() : promo.description
    };

    this.promotions.set(id, updated);
    return { success: true, promo: updated };
  }

  // DELETE /promos/:id (HU-69 Delete Promo)
  public deletePromotion(id: string): boolean {
    return this.promotions.delete(id);
  }

  // POST /promos/:id/claim (CC-1 Atomic Decrement)
  public async claimPromotion(promoId: string, userId: string): Promise<{
    success: boolean;
    status: number;
    code: string;
    message: string;
    discountCode?: string;
    remainingStock?: number;
  }> {
    const releaseLock = await this.acquireLock(promoId);

    try {
      const promo = this.promotions.get(promoId);

      if (!promo) {
        return {
          success: false,
          status: 404,
          code: 'PROMO_NOT_FOUND',
          message: 'La promoción solicitada no existe.'
        };
      }

      if (new Date(promo.expiresAt).getTime() <= Date.now()) {
        promo.status = 'Expirada';
        this.emitEvent('PROMO.EXPIRED', { promoId: promo.id, userId });
        return {
          success: false,
          status: 409,
          code: 'PROMO_EXPIRED',
          message: 'La promoción ya ha vencido y no se pueden reclamar más cupones.'
        };
      }

      if (promo.currentStock <= 0) {
        promo.status = 'Agotada';
        this.emitEvent('PROMO.REJECTED', { promoId: promo.id, userId, reason: 'STOCK_EXHAUSTED' });
        return {
          success: false,
          status: 409,
          code: 'PROMO_EXHAUSTED',
          message: 'La promoción se ha agotado. Todos los cupos disponibles ya fueron asignados.'
        };
      }

      promo.currentStock -= 1;
      if (promo.currentStock === 0) {
        promo.status = 'Agotada';
      }

      this.promotions.set(promoId, promo);

      // Save user claimed coupon
      const coupon: UserCoupon = {
        id: `cpn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        promoId: promo.id,
        promoTitle: promo.title,
        userId,
        code: promo.discountCode,
        redeemedAt: new Date().toISOString()
      };

      const existingCoupons = this.userCoupons.get(userId) || [];
      this.userCoupons.set(userId, [coupon, ...existingCoupons]);

      this.emitEvent('PROMO.WON', {
        promoId: promo.id,
        userId,
        discountCode: promo.discountCode,
        remainingStock: promo.currentStock
      });

      return {
        success: true,
        status: 200,
        code: 'PROMO_CLAIMED',
        message: '¡Reclamo exitoso! Cupón asignado correctamente.',
        discountCode: promo.discountCode,
        remainingStock: promo.currentStock
      };
    } finally {
      releaseLock();
    }
  }

  private async acquireLock(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let release: () => void = () => {};
    const lockPromise = new Promise<void>(resolve => {
      release = resolve;
    });

    this.locks.set(key, lockPromise);

    return () => {
      this.locks.delete(key);
      release();
    };
  }
}

export const promoDomainService = new PromoService();
