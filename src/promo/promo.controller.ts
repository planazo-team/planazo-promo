import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Identity, Roles } from '../common/identity';
import { ClaimRateLimitGuard } from './claim-rate-limit.guard';
import { PromoService } from './promo.service';
import type { LaunchPromoInput, Zone } from './promo.types';

/** Nombre del usuario tal como lo reenvía el gateway (codificado con encodeURIComponent). */
function nombreDesdeRequest(req: Request, fallback: string): string {
  const raw = req.headers['x-user-name'];
  const valor = Array.isArray(raw) ? raw[0] : raw;
  if (!valor) return fallback;
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

/**
 * Rutas de promo según planazo-infra/contracts/http.md. El gateway quita /api:
 *   GET  /promos?zone=        activas de la zona (o todas)
 *   POST /promos              negocio: lanza una promoción      → 201 Promo
 *   POST /promos/:id/claim    cliente: reclama un cupón (CC-1)  → 200 Coupon | 409
 *   GET  /promos/mine         cupones del usuario
 */
@Controller('promos')
export class PromoController {
  constructor(private readonly promo: PromoService) {}

  @Get()
  listActive(@Query('zone') zone?: Zone) {
    return this.promo.listActive(zone === 'zona-g' || zone === 'zona-t' ? zone : undefined);
  }

  @Roles('negocio')
  @Post()
  @HttpCode(201)
  launch(@Identity() who: Identity, @Body() body: LaunchPromoInput) {
    return this.promo.launch(who, body);
  }

  @Get('mine')
  myCoupons(@Identity() who: Identity) {
    return this.promo.myCoupons(who.userId);
  }

  @Roles('cliente')
  @UseGuards(ClaimRateLimitGuard)
  @Post(':id/claim')
  @HttpCode(200)
  claim(@Identity() who: Identity, @Req() req: Request, @Param('id') id: string) {
    return this.promo.claim({ ...who, userName: nombreDesdeRequest(req, who.userId) }, id);
  }
}
