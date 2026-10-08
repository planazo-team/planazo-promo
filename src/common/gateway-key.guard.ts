import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { config } from '../config';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Nombre del header con el que el API Gateway se identifica ante los servicios. */
export const GATEWAY_KEY_HEADER = 'x-gateway-key';

/** Token de inyección para sobreescribir la clave (útil en tests). */
export const GATEWAY_KEY_TOKEN = 'planazo:gatewayKey';

/**
 * Guard global: si GATEWAY_KEY está definida, toda petición debe traer el
 * header `x-gateway-key` con ese valor. Si no está definida (desarrollo), se
 * deja pasar todo. Las rutas marcadas con @Public() quedan exentas siempre.
 */
@Injectable()
export class GatewayKeyGuard implements CanActivate {
  private readonly gatewayKey: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(GATEWAY_KEY_TOKEN) gatewayKey?: string,
  ) {
    // Si nadie inyecta la clave explícitamente, se usa la de la configuración.
    this.gatewayKey = gatewayKey === undefined ? config.gatewayKey : gatewayKey;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.gatewayKey) {
      return true;
    }

    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublica) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const recibida = request.headers[GATEWAY_KEY_HEADER];
    if (recibida === this.gatewayKey) {
      return true;
    }

    throw new UnauthorizedException({
      code: 'GATEWAY_KEY_INVALIDA',
      message: 'La petición no viene del API Gateway o la clave es incorrecta.',
    });
  }
}
