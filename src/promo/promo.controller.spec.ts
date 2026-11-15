import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { PromoController } from './promo.controller';
import { PromoService } from './promo.service';
import type { LaunchPromoInput } from './promo.types';

describe('PromoController', () => {
  let controller: PromoController;
  let promoService: jest.Mocked<PromoService>;

  beforeEach(async () => {
    const mockPromoService: Partial<jest.Mocked<PromoService>> = {
      listActive: jest.fn(),
      launch: jest.fn(),
      myCoupons: jest.fn(),
      claim: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromoController],
      providers: [
        {
          provide: PromoService,
          useValue: mockPromoService,
        },
      ],
    }).compile();

    controller = module.get<PromoController>(PromoController);
    promoService = module.get(PromoService);
  });

  it('debe listar promociones activas sin filtro de zona si la zona no es válida', async () => {
    (promoService.listActive as jest.Mock).mockResolvedValueOnce([]);
    const res = await controller.listActive('otra-zona' as any);
    expect(promoService.listActive).toHaveBeenCalledWith(undefined);
    expect(res).toEqual([]);
  });

  it('debe listar promociones activas con filtro si la zona es zona-g o zona-t', async () => {
    (promoService.listActive as jest.Mock).mockResolvedValueOnce([]);
    await controller.listActive('zona-g');
    expect(promoService.listActive).toHaveBeenCalledWith('zona-g');

    await controller.listActive('zona-t');
    expect(promoService.listActive).toHaveBeenCalledWith('zona-t');
  });

  it('debe lanzar una promoción cuando llama launch', async () => {
    const who = { userId: 'b1', role: 'negocio' as const, placeId: 'place-1' };
    const body: LaunchPromoInput = {
      placeId: 'place-1',
      title: '2x1 Cerveza',
      discount: '50%',
      stock: 10,
      durationS: 1800,
    };
    const mockPromo = { id: 'p1', ...body } as any;
    (promoService.launch as jest.Mock).mockResolvedValueOnce(mockPromo);

    const res = await controller.launch(who, body);
    expect(promoService.launch).toHaveBeenCalledWith(who, body);
    expect(res).toBe(mockPromo);
  });

  it('debe retornar los cupones del usuario en myCoupons', async () => {
    const who = { userId: 'u1', role: 'cliente' as const };
    (promoService.myCoupons as jest.Mock).mockResolvedValueOnce([]);
    const res = await controller.myCoupons(who);
    expect(promoService.myCoupons).toHaveBeenCalledWith('u1');
    expect(res).toEqual([]);
  });

  it('debe procesar el reclamo de un cupón con header x-user-name codificado', async () => {
    const who = { userId: 'u1', role: 'cliente' as const };
    const req = {
      headers: {
        'x-user-name': encodeURIComponent('Carlos Pérez'),
      },
    } as unknown as Request;

    (promoService.claim as jest.Mock).mockResolvedValueOnce({ id: 'c1', code: 'PROMO-1' } as any);

    const res = await controller.claim(who, req, 'promo-123');
    expect(promoService.claim).toHaveBeenCalledWith(
      {
        userId: 'u1',
        role: 'cliente',
        userName: 'Carlos Pérez',
      },
      'promo-123',
    );
    expect(res).toEqual({ id: 'c1', code: 'PROMO-1' });
  });

  it('debe usar fallback si x-user-name no está presente', async () => {
    const who = { userId: 'u1', role: 'cliente' as const };
    const req = {
      headers: {},
    } as unknown as Request;

    (promoService.claim as jest.Mock).mockResolvedValueOnce({ id: 'c2' } as any);

    await controller.claim(who, req, 'promo-123');
    expect(promoService.claim).toHaveBeenCalledWith(
      {
        userId: 'u1',
        role: 'cliente',
        userName: 'u1',
      },
      'promo-123',
    );
  });

  it('debe manejar x-user-name mal formado sin lanzar excepción', async () => {
    const who = { userId: 'u1', role: 'cliente' as const };
    const req = {
      headers: {
        'x-user-name': '%E0%A4%A', // secuencia URI inválida
      },
    } as unknown as Request;

    (promoService.claim as jest.Mock).mockResolvedValueOnce({ id: 'c3' } as any);

    await controller.claim(who, req, 'promo-123');
    expect(promoService.claim).toHaveBeenCalledWith(
      {
        userId: 'u1',
        role: 'cliente',
        userName: '%E0%A4%A',
      },
      'promo-123',
    );
  });
});
