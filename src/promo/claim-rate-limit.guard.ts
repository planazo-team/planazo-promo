import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { identidadDesdeRequest } from '../common/identity';
import { rechazosCupon } from '../common/metrics';
import { config } from '../config';
import { CLAIM_RATE_LIMIT_STORE, type ClaimRateLimitStore } from './claim-rate-limit.store';

/**
 * Guard de POST /promos/:id/claim (CC-1): más de `claimRateLimitMax`
 * intentos por usuario en `claimRateLimitWindowS` responden 429, antes de
 * llegar al servicio. Va después de RolesGuard (@Roles('cliente') en el
 * controlador ya exige identidad), por eso aquí se asume presente.
 */
@Injectable()
export class ClaimRateLimitGuard implements CanActivate {
  constructor(@Inject(CLAIM_RATE_LIMIT_STORE) private readonly store: ClaimRateLimitStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const identidad = identidadDesdeRequest(request);
    if (!identidad) {
      // RolesGuard ya habría rechazado la petición antes de llegar aquí.
      return true;
    }

    const { limitado, reintentarEnS } = await this.store.hit(
      identidad.userId,
      config.claimRateLimitMax,
      config.claimRateLimitWindowS,
    );
    if (!limitado) {
      return true;
    }

    rechazosCupon.inc({ motivo: 'LIMITE_RECLAMOS' });
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(reintentarEnS));
    throw new HttpException(
      {
        code: 'LIMITE_RECLAMOS',
        message: `Demasiados intentos de reclamo, espera ${reintentarEnS}s antes de volver a intentarlo.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
