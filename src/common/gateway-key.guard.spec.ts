import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GATEWAY_KEY_HEADER, GatewayKeyGuard } from './gateway-key.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Crea un ExecutionContext falso con los headers dados y metadata opcional de ruta pública. */
function contexto(headers: Record<string, string>, esPublica = false): ExecutionContext {
  const handler = () => undefined;
  if (esPublica) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  }
  class Controlador {}

  return {
    getHandler: () => handler,
    getClass: () => Controlador,
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('GatewayKeyGuard', () => {
  const reflector = new Reflector();

  describe('sin GATEWAY_KEY definida (desarrollo)', () => {
    const guard = new GatewayKeyGuard(reflector, '');

    it('deja pasar peticiones sin header', () => {
      expect(guard.canActivate(contexto({}))).toBe(true);
    });

    it('deja pasar peticiones con cualquier header', () => {
      expect(guard.canActivate(contexto({ [GATEWAY_KEY_HEADER]: 'lo-que-sea' }))).toBe(true);
    });
  });

  describe('con GATEWAY_KEY definida', () => {
    const guard = new GatewayKeyGuard(reflector, 'secreto');

    it('rechaza con 401 GATEWAY_KEY_INVALIDA si falta el header', () => {
      expect.assertions(3);
      try {
        guard.canActivate(contexto({}));
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const e = err as UnauthorizedException;
        expect(e.getStatus()).toBe(401);
        expect(e.getResponse()).toMatchObject({ code: 'GATEWAY_KEY_INVALIDA' });
      }
    });

    it('rechaza con 401 si la clave es incorrecta', () => {
      expect(() => guard.canActivate(contexto({ [GATEWAY_KEY_HEADER]: 'otra' }))).toThrow(
        UnauthorizedException,
      );
    });

    it('deja pasar si la clave es correcta', () => {
      expect(guard.canActivate(contexto({ [GATEWAY_KEY_HEADER]: 'secreto' }))).toBe(true);
    });

    it('deja pasar rutas marcadas con @Public() aunque falte el header', () => {
      expect(guard.canActivate(contexto({}, true))).toBe(true);
    });
  });
});
