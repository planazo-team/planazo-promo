import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BusService } from '../bus/bus.service';
import { PromoService } from './promo.service';
import { MemoryStockStore } from './stock.store';

const NEGOCIO = { userId: 'b1', role: 'negocio' as const, placeId: 'p7' };
const CLIENTE = { userId: 'u1', role: 'cliente' as const, userName: 'Juan Diego' };

function crearServicio() {
  const publicados: Array<{ type: string; payload: unknown; topics: string[] }> = [];
  const bus = {
    publish: async (type: string, payload: unknown, topics: string[]) => {
      publicados.push({ type, payload, topics });
    },
  } as unknown as BusService;
  process.env.SEED_PROMOS = 'false';
  const servicio = new PromoService(bus, new MemoryStockStore());
  return { servicio, publicados };
}

describe('PromoService', () => {
  it('lanza una promoción y la lista como activa con su stock', async () => {
    const { servicio, publicados } = crearServicio();
    const promo = await servicio.launch(NEGOCIO, {
      placeId: 'p7',
      title: '2x1 en cócteles',
      discount: '2x1',
      stock: 3,
      durationS: 60,
    });
    expect(promo.placeName).toBe('Bar El Zaguán');
    expect(promo.zone).toBe('zona-t');
    expect(promo.initialStock).toBe(3);
    expect(publicados[0]).toMatchObject({ type: 'PROMO.PUSH', topics: ['zone:zona-t', 'place:p7'] });

    const activas = await servicio.listActive('zona-t');
    expect(activas).toHaveLength(1);
    expect(activas[0].stock).toBe(3);
    expect(await servicio.listActive('zona-g')).toHaveLength(0);
  });

  it('no deja lanzar promociones de un establecimiento ajeno', async () => {
    const { servicio } = crearServicio();
    await expect(
      servicio.launch(NEGOCIO, { placeId: 'p1', title: 'x', discount: 'y', stock: 1, durationS: 60 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('CC-1: entrega exactamente `stock` cupones y después responde PROMO_AGOTADA', async () => {
    const { servicio, publicados } = crearServicio();
    const promo = await servicio.launch(NEGOCIO, {
      placeId: 'p7',
      title: 'Solo dos',
      discount: '-50%',
      stock: 2,
      durationS: 60,
    });

    // Diez reclamos simultáneos contra stock 2.
    const resultados = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => servicio.claim({ ...CLIENTE, userId: `u${i}` }, promo.id)),
    );
    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const agotadas = resultados.filter(
      (r) =>
        r.status === 'rejected' &&
        r.reason instanceof ConflictException &&
        (r.reason.getResponse() as { code: string }).code === 'PROMO_AGOTADA',
    );
    expect(ok).toHaveLength(2);
    expect(agotadas).toHaveLength(8);
    expect(publicados.filter((e) => e.type === 'PROMO.WON')).toHaveLength(2);

    // Sin stock ya no aparece como activa.
    expect(await servicio.listActive()).toHaveLength(0);
  });

  it('el cupón entregado queda en /promos/mine del ganador', async () => {
    const { servicio } = crearServicio();
    const promo = await servicio.launch(NEGOCIO, {
      placeId: 'p7',
      title: 'Uno',
      discount: '-10%',
      stock: 1,
      durationS: 60,
    });
    const cupon = await servicio.claim(CLIENTE, promo.id);
    expect(cupon.code).toMatch(/^PLZ-[A-Z2-9]{5}$/);
    expect(cupon.placeName).toBe('Bar El Zaguán');
    expect(servicio.myCoupons('u1')).toEqual([cupon]);
    expect(servicio.myCoupons('u2')).toEqual([]);
  });

  it('rechaza reclamar una promoción vencida o inexistente', async () => {
    const { servicio } = crearServicio();
    await expect(servicio.claim(CLIENTE, 'no-existe')).rejects.toBeInstanceOf(NotFoundException);

    const promo = await servicio.launch(NEGOCIO, {
      placeId: 'p7',
      title: 'Corta',
      discount: '-5%',
      stock: 1,
      durationS: 10,
    });
    const ahora = Date.now;
    Date.now = () => ahora() + 11_000;
    try {
      await expect(servicio.claim(CLIENTE, promo.id)).rejects.toMatchObject({
        response: { code: 'PROMO_VENCIDA' },
      });
    } finally {
      Date.now = ahora;
    }
  });
});
