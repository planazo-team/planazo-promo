import { Promotion, Zone } from '../types';
import { INITIAL_PROMOTIONS } from '../data/mockData';

export interface DomainEvent {
  type: 'PROMO.PUSH' | 'PROMO.WON' | 'PROMO.REJECTED' | 'PROMO.EXPIRED';
  seq: number;
  timestamp: string;
  data: any;
}

class PromoService {
  private promotions: Map<string, Promotion> = new Map();
  private eventLog: DomainEvent[] = [];
  private globalSeq = 0;
  private locks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.seed();
  }

  public seed() {
    this.promotions.clear();
    INITIAL_PROMOTIONS.forEach(p => {
      this.promotions.set(p.id, { ...p });
    });
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

  // GET /promos & /promos/place/:placeId (HU-17)
  public getPromotions(options?: { placeId?: string; zone?: string; activeOnly?: boolean }): Promotion[] {
    const now = Date.now();
    let list = Array.from(this.promotions.values());

    // Auto-update status
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
    }
  ): { success: boolean; promo?: Promotion; error?: string; code?: string } {
    // 1. Mandatory Data Validation (HU-26 CA1)
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

    // Emite evento de dominio PROMO.PUSH (§6.4)
    this.emitEvent('PROMO.PUSH', {
      promoId: newPromo.id,
      placeId: newPromo.establishmentId,
      zone: newPromo.zone,
      title: newPromo.title,
      discountCode: newPromo.discountCode,
      initialStock: newPromo.initialStock
    });

    return { success: true, promo: newPromo };
  }

  // POST /promos/:id/claim (CC-1 Atomic Decrement & Concurrency Challenge)
  public async claimPromotion(promoId: string, userId: string): Promise<{
    success: boolean;
    status: number;
    code: string;
    message: string;
    discountCode?: string;
    remainingStock?: number;
  }> {
    // Acquire mutex lock per promo ID to ensure atomic DECR operation (CC-1)
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

      // CC-1 Atomic Check & Decrement
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

      // Indivisible Decrement
      promo.currentStock -= 1;
      if (promo.currentStock === 0) {
        promo.status = 'Agotada';
      }

      this.promotions.set(promoId, promo);

      // Emite evento PROMO.WON (§6.4)
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
