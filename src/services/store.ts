import { Establishment, PlanazoEvent, Promotion } from '../types';
import { INITIAL_ESTABLISHMENTS, INITIAL_EVENTS, INITIAL_PROMOTIONS } from '../data/mockData';

const STORAGE_KEYS = {
  ESTABLISHMENTS: 'planazo_establishments_v1',
  EVENTS: 'planazo_events_v1',
  PROMOTIONS: 'planazo_promotions_v1'
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

  // --- EVENTS (HU-23 & HU-16) ---
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
    this.notify();

    return { success: true, event: newEvent };
  }

  // --- PROMOTIONS (HU-26 & HU-17 & CC-1) ---
  public getPromotions(establishmentId?: string, zone?: string, onlyActive = true): Promotion[] {
    let promos: Promotion[] = [];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROMOTIONS);
      promos = data ? JSON.parse(data) : INITIAL_PROMOTIONS;
    } catch {
      promos = INITIAL_PROMOTIONS;
    }

    const now = new Date().getTime();

    promos = promos.map(p => {
      const expTime = new Date(p.expiresAt).getTime();
      if (expTime <= now) {
        return { ...p, status: 'Expirada' as const };
      }
      if (p.currentStock <= 0) {
        return { ...p, status: 'Agotada' as const };
      }
      return p;
    });

    if (establishmentId) {
      promos = promos.filter(p => p.establishmentId === establishmentId);
    }

    if (zone && zone !== 'Todas') {
      promos = promos.filter(p => p.zone === zone);
    }

    if (onlyActive) {
      promos = promos.filter(p => p.status === 'Activa');
    }

    return promos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public addPromotion(promoData: Omit<Promotion, 'id' | 'currentStock' | 'status' | 'createdAt'>): { success: boolean; promo?: Promotion; error?: string } {
    if (!promoData.establishmentId) return { success: false, error: 'Debe especificar el establecimiento.' };
    if (!promoData.title || promoData.title.trim().length === 0) return { success: false, error: 'El título de la promoción es obligatorio.' };
    if (!promoData.description || promoData.description.trim().length === 0) return { success: false, error: 'La descripción es obligatoria.' };
    if (!promoData.discountCode || promoData.discountCode.trim().length === 0) return { success: false, error: 'El código de cupón es obligatorio.' };
    if (!promoData.initialStock || promoData.initialStock <= 0) return { success: false, error: 'El número de cupos/stock debe ser mayor a 0.' };
    if (!promoData.expiresAt) return { success: false, error: 'La fecha de vencimiento es obligatoria.' };

    const newPromo: Promotion = {
      ...promoData,
      id: `prm-${Date.now()}`,
      currentStock: promoData.initialStock,
      status: 'Activa',
      createdAt: new Date().toISOString()
    };

    const currentPromos = this.getPromotions(undefined, undefined, false);
    const updated = [newPromo, ...currentPromos];
    localStorage.setItem(STORAGE_KEYS.PROMOTIONS, JSON.stringify(updated));

    // Try sync to backend service port 3002
    fetch(`${BACKEND_URL}/promos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'negocio',
        'x-user-place-id': promoData.establishmentId
      },
      body: JSON.stringify(promoData)
    }).catch(() => {});

    this.notify();
    return { success: true, promo: newPromo };
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

    // Also claim on backend service 3002
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

  // CC-1 Concurrency Test (50 parallel requests over stock = 3)
  public async runCC1BurstTest(targetPromoId?: string): Promise<{
    totalSent: number;
    successCount: number;
    rejected409Count: number;
    finalStock: number;
    passed: boolean;
  }> {
    // 1. Create a promo with stock = 3
    const testPromoId = targetPromoId || `test-cc1-${Date.now()}`;
    const initialStock = 3;

    // Create promo in service
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

    // 2. Fire 50 simultaneous HTTP POST requests to claim endpoint
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

    // Check final stock
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
    fetch(`${BACKEND_URL}/promos/reset`, { method: 'POST' }).catch(() => {});
    this.notify();
  }
}

export const storeService = new StoreService();
