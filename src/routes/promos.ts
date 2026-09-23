import { Router, Request, Response } from 'express';
import { promoDomainService } from '../services/promoService';

export const promoRouter = Router();

// GET /promos — Consultar promociones (HU-17 / HU-69)
promoRouter.get('/', (req: Request, res: Response) => {
  const zone = req.query.zone as string | undefined;
  const placeId = req.query.placeId as string | undefined;
  const activeOnly = req.query.active !== 'false';

  const promos = promoDomainService.getPromotions({ zone, placeId, activeOnly });
  res.json(promos);
});

// GET /promos/notifications — Consultar notificaciones en vivo (HU-89 / HU-90)
promoRouter.get('/notifications', (_req: Request, res: Response) => {
  const notifications = promoDomainService.getNotifications();
  res.json(notifications);
});

// GET /promos/events — Log de eventos de promociones (§6.4)
promoRouter.get('/events', (_req: Request, res: Response) => {
  const logs = promoDomainService.getEventLog();
  res.json(logs);
});

// GET /promos/place/:placeId — Consultar promociones de un establecimiento (HU-17)
promoRouter.get('/place/:placeId', (req: Request, res: Response) => {
  const { placeId } = req.params;
  const promos = promoDomainService.getPromotions({ placeId, activeOnly: false });
  res.json(promos);
});

// GET /promos/:id — Detalle de promoción
promoRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const promo = promoDomainService.getPromotionById(id);

  if (!promo) {
    return res.status(404).json({
      code: 'PROMO_NOT_FOUND',
      message: 'La promoción solicitada no fue encontrada.'
    });
  }

  res.json(promo);
});

// POST /promos — Publicar nueva promoción (HU-26 / HU-69)
promoRouter.post('/', (req: Request, res: Response) => {
  const userPlaceId = req.headers['x-user-place-id'] as string | undefined;

  const { establishmentId, zone, title, description, discountPercentage, discountCode, initialStock, expiresAt, placeName } = req.body;

  const targetPlaceId = establishmentId || userPlaceId;
  const targetZone = zone || 'Zona G';

  if (!targetPlaceId) {
    return res.status(400).json({
      code: 'MISSING_ESTABLISHMENT',
      message: 'No se especificó el establecimiento autorizado para publicar.'
    });
  }

  const result = promoDomainService.createPromotion(targetPlaceId, targetZone, {
    title,
    description,
    discountPercentage,
    discountCode,
    initialStock,
    expiresAt,
    placeName
  });

  if (!result.success) {
    return res.status(400).json({
      code: result.code || 'VALIDATION_ERROR',
      message: result.error || 'Error de validación al crear la promoción.'
    });
  }

  res.status(201).json(result.promo);
});

// PUT /promos/:id — Editar promoción existente (HU-69)
promoRouter.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const result = promoDomainService.updatePromotion(id, req.body);

  if (!result.success) {
    return res.status(400).json({
      code: 'UPDATE_FAILED',
      message: result.error || 'Error al actualizar la promoción.'
    });
  }

  res.json(result.promo);
});

// DELETE /promos/:id — Eliminar promoción (HU-69)
promoRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = promoDomainService.deletePromotion(id);

  if (!deleted) {
    return res.status(404).json({
      code: 'PROMO_NOT_FOUND',
      message: 'No se encontró la promoción a eliminar.'
    });
  }

  res.json({ success: true, message: 'Promoción eliminada correctamente.' });
});

// POST /promos/:id/claim — Reclamar cupón con decremento atómico (CC-1)
promoRouter.post('/:id/claim', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req.headers['x-user-id'] as string) || 'u1';

  const result = await promoDomainService.claimPromotion(id, userId);

  if (!result.success) {
    return res.status(result.status).json({
      code: result.code,
      message: result.message
    });
  }

  res.status(200).json({
    success: true,
    code: result.discountCode,
    message: result.message,
    remainingStock: result.remainingStock
  });
});
