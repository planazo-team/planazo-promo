import { ExecutionContext, HttpException } from '@nestjs/common';
import { ClaimRateLimitGuard } from './claim-rate-limit.guard';
import type { ClaimRateLimitStore } from './claim-rate-limit.store';
import { HEADER_USER_ID, HEADER_USER_ROLE } from '../common/identity';

/** Crea un ExecutionContext falso con los headers dados y un response mock para setHeader. */
function contexto(headers: Record<string, string>) {
  const setHeader = jest.fn();
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, setHeader };
}

describe('ClaimRateLimitGuard', () => {
  let store: jest.Mocked<ClaimRateLimitStore>;
  let guard: ClaimRateLimitGuard;

  beforeEach(() => {
    store = { hit: jest.fn() };
    guard = new ClaimRateLimitGuard(store);
  });

  it('deja pasar si no hay identidad en la petición (RolesGuard ya la habría rechazado)', async () => {
    const { ctx } = contexto({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(store.hit).not.toHaveBeenCalled();
  });

  it('deja pasar y consulta el store por el userId cuando no está limitado', async () => {
    store.hit.mockResolvedValueOnce({ limitado: false, reintentarEnS: 30 });
    const { ctx } = contexto({ [HEADER_USER_ID]: 'u1', [HEADER_USER_ROLE]: 'cliente' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(store.hit).toHaveBeenCalledWith('u1', expect.any(Number), expect.any(Number));
  });

  it('rechaza con 429 LIMITE_RECLAMOS y header Retry-After cuando está limitado', async () => {
    store.hit.mockResolvedValueOnce({ limitado: true, reintentarEnS: 17 });
    const { ctx, setHeader } = contexto({ [HEADER_USER_ID]: 'u1', [HEADER_USER_ROLE]: 'cliente' });

    expect.assertions(4);
    try {
      await guard.canActivate(ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const e = err as HttpException;
      expect(e.getStatus()).toBe(429);
      expect(e.getResponse()).toMatchObject({ code: 'LIMITE_RECLAMOS' });
      expect(setHeader).toHaveBeenCalledWith('Retry-After', '17');
    }
  });
});
