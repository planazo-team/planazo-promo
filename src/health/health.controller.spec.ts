import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { HealthController } from './health.controller';
import { version } from '../version';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('responde UP con el nombre del servicio, la versión y el uptime', () => {
    const res = controller.health();

    expect(res.status).toBe('UP');
    expect(res.service).toBe('planazo-promo');
    expect(res.version).toBe(version);
    expect(typeof res.replica).toBe('string');
    expect(typeof res.uptimeS).toBe('number');
    expect(res.uptimeS).toBeGreaterThanOrEqual(0);
  });

  it('la ruta está marcada como pública (exenta del guard de gateway)', () => {
    const reflector = new Reflector();
    const esPublica = reflector.get<boolean>(IS_PUBLIC_KEY, controller.health);
    expect(esPublica).toBe(true);
  });
});
