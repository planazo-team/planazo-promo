import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  HEADER_USER_ID,
  HEADER_USER_PLACE_ID,
  HEADER_USER_ROLE,
  RolesGuard,
  identidadDesdeRequest,
} from './identity';

describe('Identity helpers y RolesGuard', () => {
  describe('identidadDesdeRequest', () => {
    it('debe devolver undefined si falta x-user-id', () => {
      const req = {
        headers: { [HEADER_USER_ROLE]: 'cliente' },
      } as unknown as Request;
      expect(identidadDesdeRequest(req)).toBeUndefined();
    });

    it('debe devolver undefined si el rol no es cliente ni negocio', () => {
      const req = {
        headers: {
          [HEADER_USER_ID]: 'u1',
          [HEADER_USER_ROLE]: 'admin',
        },
      } as unknown as Request;
      expect(identidadDesdeRequest(req)).toBeUndefined();
    });

    it('debe devolver la identidad de cliente sin placeId', () => {
      const req = {
        headers: {
          [HEADER_USER_ID]: 'u1',
          [HEADER_USER_ROLE]: 'cliente',
        },
      } as unknown as Request;
      expect(identidadDesdeRequest(req)).toEqual({
        userId: 'u1',
        role: 'cliente',
      });
    });

    it('debe devolver la identidad de negocio con placeId', () => {
      const req = {
        headers: {
          [HEADER_USER_ID]: 'b1',
          [HEADER_USER_ROLE]: 'negocio',
          [HEADER_USER_PLACE_ID]: 'place-99',
        },
      } as unknown as Request;
      expect(identidadDesdeRequest(req)).toEqual({
        userId: 'b1',
        role: 'negocio',
        placeId: 'place-99',
      });
    });

    it('debe manejar headers en formato arreglo', () => {
      const req = {
        headers: {
          [HEADER_USER_ID]: ['u2', 'u3'],
          [HEADER_USER_ROLE]: ['cliente'],
        },
      } as unknown as Request;
      expect(identidadDesdeRequest(req)).toEqual({
        userId: 'u2',
        role: 'cliente',
      });
    });
  });

  describe('RolesGuard', () => {
    let guard: RolesGuard;
    let reflector: jest.Mocked<Reflector>;

    beforeEach(() => {
      reflector = {
        getAllAndOverride: jest.fn(),
      } as unknown as jest.Mocked<Reflector>;
      guard = new RolesGuard(reflector);
    });

    function mockContext(request: Partial<Request>): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;
    }

    it('debe permitir acceso si no hay roles requeridos', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(undefined);
      const ctx = mockContext({});
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('debe permitir acceso si la lista de roles requeridos está vacía', () => {
      reflector.getAllAndOverride.mockReturnValueOnce([]);
      const ctx = mockContext({});
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('debe permitir acceso si el rol de la petición coincide', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['negocio']);
      const ctx = mockContext({
        headers: {
          [HEADER_USER_ID]: 'b1',
          [HEADER_USER_ROLE]: 'negocio',
        },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('debe lanzar ForbiddenException si el rol no coincide', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['negocio']);
      const ctx = mockContext({
        headers: {
          [HEADER_USER_ID]: 'u1',
          [HEADER_USER_ROLE]: 'cliente',
        },
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('debe lanzar ForbiddenException si no viene identidad', () => {
      reflector.getAllAndOverride.mockReturnValueOnce(['cliente']);
      const ctx = mockContext({
        headers: {},
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
