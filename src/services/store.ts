import { Establishment, PlanazoEvent, Promotion, AppNotification } from '../types';
import { INITIAL_ESTABLISHMENTS, INITIAL_EVENTS, INITIAL_PROMOTIONS } from '../data/mockData';
import { promoDomainService } from './promoService';

const STORAGE_KEYS = {
  ESTABLISHMENTS: 'planazo_establishments_v1',
  EVENTS: 'planazo_events_v1',
  PROMOTIONS: 'planazo_promotions_v1',
  NOTIFICATIONS: 'planazo_notifications_v1'
};

const BACKEND_URL = 'http://localhost:3002';

class StoreService {
  private listeners: Array<() => void> = [];

  constructor() {
    this.initDefaultData();
  }

  private initDefaultData() {
    if (!localStorage.getItem(STORAGE_KEYS.ESTABLISHMENTS)) {
      localStorage.setItem(STORAGE_KEYS.ESTABLISHMENTS, JSON.stringify(INITIAL_ESTABLISHMENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EVENTS)) {
      localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(INITIAL_EVENTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.PROMOTIONS)) {
      localStorage.setItem(STORAGE_KEYS.PROMOTIONS, JSON.stringify(INITIAL_PROMOTIONS));
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public notify() {
    this.listeners.forEach(listener => listener());
  }

  // --- NOTIFICATIONS (HU-89 & HU-90) ---
  public getNotifications(): AppNotification[] {
    return promoDomainService.getNotifications();
  }

  public markNotificationAsRead(id: string) {
    promoDomainService.markNotificationAsRead(id);
    this.notify();
  }

  public markAllNotificationsAsRead() {
    promoDomainService.markAllNotificationsAsRead();
    this.notify();
  }

  // --- ESTABLISHMENTS ---
  public getEstablishments(): Establishment[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ESTABLISHMENTS);
      return data ? JSON.parse(data) : INITIAL_ESTABLISHMENTS;
    } catch {
      return INITIAL_ESTABLISHMENTS;
    }
  }

  public getEstablishmentById(id: string): Establishment | undefined {
    return this.getEstablishments().find(e => e.id === id);
  }

  // --- EVENTS (HU-23, HU-16, HU-68, HU-90) ---
  public getEvents(establishmentId?: string, category?: string, date?: string): PlanazoEvent[] {
    let events: PlanazoEvent[] = [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
      events = data ? JSON.parse(data) : INITIAL_EVENTS;
    } catch {
      events = INITIAL_EVENTS;
    }

    if (establishmentId) {
      events = events.filter(e => e.establishmentId === establishmentId);
    }

    if (category && category !== 'Todas') {
      events = events.filter(e => e.category === category);
    }

    if (date) {
      events = events.filter(e => e.date === date);
    }

    return events.sort((a, b) => {
      const timeA = new Date(`${a.date}T${a.startTime}`).getTime();
      const timeB = new Date(`${b.date}T${b.startTime}`).getTime();
      return timeA - timeB;
    });
  }

  public addEvent(eventData: Omit<PlanazoEvent, 'id' | 'bookedCapacity' | 'status' | 'createdAt'>): { success: boolean; event?: PlanazoEvent; error?: string } {
    if (!eventData.establishmentId) return { success: false, error: 'Debe especificar el establecimiento.' };
    if (!eventData.title || eventData.title.trim().length === 0) return { success: false, error: 'El título del evento es obligatorio.' };
    if (!eventData.description || eventData.description.trim().length === 0) return { success: false, error: 'La descripción del evento es obligatoria.' };
    if (!eventData.category) return { success: false, error: 'La categoría del evento es obligatoria.' };
    if (!eventData.date) return { success: false, error: 'La fecha del evento es obligatoria.' };
    if (!eventData.startTime || !eventData.endTime) return { success: false, error: 'Los horarios de inicio y fin son obligatorios.' };
    if (!eventData.maxCapacity || eventData.maxCapacity <= 0) return { success: false, error: 'El cupo máximo debe ser mayor a 0.' };

    const newEvent: PlanazoEvent = {
      ...eventData,
      id: `evt-${Date.now()}`,
      bookedCapacity: 0,
      status: 'Programado',
      createdAt: new Date().toISOString()
    };

    const currentEvents = this.getEvents();
    const updated = [newEvent, ...currentEvents];
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(updated));

    // Emit event notification (HU-90)
    const venue = this.getEstablishmentById(eventData.establishmentId);
    promoDomainService.addNotification({
      title: `🎉 Nuevo Evento en ${venue?.zone || 'la ciudad'}`,
      message: `${venue?.name || 'Un negocio'} programó: "${newEvent.title}" para el ${newEvent.date}`,
      type: 'event',
      zone: venue?.zone || 'Zona G',
      placeName: venue?.name,
      linkId: newEvent.id
    });

    this.notify();
    return { success: true, event: newEvent };
  }

  // HU-68 Update Event
  public updateEvent(id: string, data: Partial<PlanazoEvent>): { success: boolean; event?: PlanazoEvent; error?: string } {
    const events = this.getEvents();
    const index = events.findIndex(e => e.id === id);
    if (index === -1) return { success: false, error: 'El evento no fue encontrado.' };

    events[index] = { ...events[index], ...data };
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
    this.notify();
    return { success: true, event: events[index] };
  }

  // HU-68 Update Event Status
  public updateEventStatus(id: string, status: PlanazoEvent['status']) {
    return this.updateEvent(id, { status });
  }

  // HU-68 Delete Event
  public deleteEvent(id: string): boolean {
    const events = this.getEvents();
    const filtered = events.filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(filtered));
    this.notify();
    return true;
  }

  // --- PROMOTIONS (HU-26, HU-17, HU-69, HU-89) ---
  public getPromotions(establishmentId?: string, zone?: string, onlyActive = true): Promotion[] {
    return promoDomainService.getPromotions({ placeId: establishmentId, zone, activeOnly: onlyActive });
  }

  public addPromotion(promoData: Omit<Promotion, 'id' | 'currentStock' | 'status' | 'createdAt'>): { success: boolean; promo?: Promotion; error?: string } {
    if (!promoData.establishmentId) return { success: false, error: 'Debe especificar el establecimiento.' };
    if (!promoData.title || promoData.title.trim().length === 0) return { success: false, error: 'El título de la promoción es obligatorio.' };
    if (!promoData.description || promoData.description.trim().length === 0) return { success: false, error: 'La descripción es obligatoria.' };
    if (!promoData.discountCode || promoData.discountCode.trim().length === 0) return { success: false, error: 'El código de cupón es obligatorio.' };
    if (!promoData.initialStock || promoData.initialStock <= 0) return { success: false, error: 'El número de cupos/stock debe ser mayor a 0.' };
    if (!promoData.expiresAt) return { success: false, error: 'La fecha de vencimiento es obligatoria.' };

    const venue = this.getEstablishmentById(promoData.establishmentId);

    const result = promoDomainService.createPromotion(
      promoData.establishmentId,
      promoData.zone,
      {
        ...promoData,
        placeName: venue?.name
      }
    );

    if (result.success && result.promo) {
      const current = this.getPromotions(undefined, undefined, false);
      localStorage.setItem(STORAGE_KEYS.PROMOTIONS, JSON.stringify([result.promo, ...current]));
      this.notify();
    }

    return result;
  }

  // HU-69 Update Promo
  public updatePromotion(id: string, data: Partial<Promotion>): { success: boolean; promo?: Promotion; error?: string } {
    const result = promoDomainService.updatePromotion(id, data);
    this.notify();
    return result;
  }

  // HU-69 Delete Promo
  public deletePromotion(id: string): boolean {
    const res = promoDomainService.deletePromotion(id);
    this.notify();
    return res;
  }

  public claimPromotion(promoId: string): { success: boolean; message: string; code?: string } {
    const promos = this.getPromotions(undefined, undefined, false);
    const index = promos.findIndex(p => p.id === promoId);

    if (index === -1) {
      return { success: false, message: 'La promoción solicitada no existe.' };
    }

    const promo = promos[index];

    if (new Date(promo.expiresAt).getTime() <= Date.now()) {
      return { success: false, message: 'La promoción ya ha expirado.' };
    }

    if (promo.currentStock <= 0) {
      return { success: false, message: '¡Lo sentimos! Esta promoción se acaba de agotar.' };
    }

    const updatedStock = promo.currentStock - 1;
    promos[index] = {
      ...promo,
      currentStock: updatedStock,
      status: updatedStock <= 0 ? 'Agotada' : 'Activa'
    };

    localStorage.setItem(STORAGE_KEYS.PROMOTIONS, JSON.stringify(promos));

    fetch(`${BACKEND_URL}/promos/${promoId}/claim`, {
      method: 'POST',
      headers: { 'x-user-id': 'u1' }
    }).catch(() => {});

    this.notify();

    return {
      success: true,
      message: `¡Promoción reclamada con éxito! Quedan ${updatedStock} cupos disponibles.`,
      code: promo.discountCode
    };
  }

  // CC-1 Concurrency Test
  public async runCC1BurstTest(targetPromoId?: string): Promise<{
    totalSent: number;
    successCount: number;
    rejected409Count: number;
    finalStock: number;
    passed: boolean;
  }> {
    const testPromoId = targetPromoId || `test-cc1-${Date.now()}`;
    const initialStock = 3;

    const createRes = await fetch(`${BACKEND_URL}/promos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'negocio', 'x-user-place-id': 'est-1' },
      body: JSON.stringify({
        title: 'CC-1 Concurrency Test Promo',
        description: 'Prueba de estrés de 50 reclamos simultáneos',
        discountCode: 'BURST3',
        initialStock,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      })
    });

    const createdPromo = await createRes.json();
    const activeId = createdPromo.id || testPromoId;

    const burstSize = 50;
    const promises: Promise<Response>[] = [];

    for (let i = 0; i < burstSize; i++) {
      promises.push(
        fetch(`${BACKEND_URL}/promos/${activeId}/claim`, {
          method: 'POST',
          headers: { 'x-user-id': `u${(i % 6) + 1}` }
        })
      );
    }

    const responses = await Promise.all(promises);

    let successCount = 0;
    let rejected409Count = 0;

    for (const res of responses) {
      if (res.status === 200) successCount++;
      if (res.status === 409) rejected409Count++;
    }

    const promoRes = await fetch(`${BACKEND_URL}/promos/${activeId}`);
    const finalPromo = await promoRes.json();
    const finalStock = finalPromo.currentStock ?? 0;

    const passed = successCount === initialStock && rejected409Count === (burstSize - initialStock) && finalStock === 0;

    return {
      totalSent: burstSize,
      successCount,
      rejected409Count,
      finalStock,
      passed
    };
  }

  public resetToDefault() {
    localStorage.setItem(STORAGE_KEYS.ESTABLISHMENTS, JSON.stringify(INITIAL_ESTABLISHMENTS));
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(INITIAL_EVENTS));
    localStorage.setItem(STORAGE_KEYS.PROMOTIONS, JSON.stringify(INITIAL_PROMOTIONS));
    promoDomainService.seed();
    fetch(`${BACKEND_URL}/promos/reset`, { method: 'POST' }).catch(() => {});
    this.notify();
  }
}

export const storeService = new StoreService();
