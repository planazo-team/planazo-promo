import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

/** Roles que reconoce el API Gateway. */
export type Role = 'cliente' | 'negocio';

/** Identidad del usuario tal como la reenvía el API Gateway en headers. */
export interface Identity {
  /** u1..u6 para clientes, b1..b3 para negocios. */
  userId: string;
  role: Role;
  /** Solo presente cuando el rol es `negocio`. */
  placeId?: string;
}

export const HEADER_USER_ID = 'x-user-id';
export const HEADER_USER_ROLE = 'x-user-role';
export const HEADER_USER_PLACE_ID = 'x-user-place-id';

function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Construye la identidad a partir de los headers de la petición.
 * Devuelve `undefined` si faltan `x-user-id` o `x-user-role` (o el rol no es válido).
 */
export function identidadDesdeRequest(request: Request): Identity | undefined {
  const userId = primerValor(request.headers[HEADER_USER_ID]);
  const role = primerValor(request.headers[HEADER_USER_ROLE]);
  if (!userId || (role !== 'cliente' && role !== 'negocio')) {
    return undefined;
  }
  const placeId = primerValor(request.headers[HEADER_USER_PLACE_ID]);
  return placeId ? { userId, role, placeId } : { userId, role };
}

/**
 * Decorador de parámetro: inyecta la identidad del usuario que viene del gateway.
 * Si la petición no trae identidad válida responde 401 { code: 'NO_AUTENTICADO' }.
 *
 *   @Get('whoami')
 *   whoami(@Identity() id: Identity) { return id; }
 */
export const Identity = createParamDecorator((_data: unknown, ctx: ExecutionContext): Identity => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const identidad = identidadDesdeRequest(request);
  if (!identidad) {
    throw new UnauthorizedException({
      code: 'NO_AUTENTICADO',
      message: 'La petición no trae identidad de usuario (x-user-id / x-user-role).',
    });
  }
  return identidad;
});

/** Clave de metadata donde @Roles() guarda los roles permitidos. */
export const ROLES_KEY = 'planazo:roles';

/**
 * Restringe un handler o controlador a ciertos roles. Requiere que el
 * RolesGuard esté registrado (en la plantilla lo está globalmente).
 *
 *   @Roles('negocio')
 *   @Post() crear() {}
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Guard de roles: si el handler tiene @Roles(...), exige que el rol de la
 * identidad esté en la lista. Responde 403 { code: 'ROL_NO_AUTORIZADO' }.
 * Sin @Roles() deja pasar a cualquiera.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const identidad = identidadDesdeRequest(request);
    if (identidad && roles.includes(identidad.role)) {
      return true;
    }

    throw new ForbiddenException({
      code: 'ROL_NO_AUTORIZADO',
      message: `Esta operación requiere rol ${roles.join(' o ')}.`,
    });
  }
}
