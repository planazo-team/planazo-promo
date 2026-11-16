import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { config } from '../config';
import { version } from '../version';
import { REPLICA } from '../common/access-log';

export interface HealthResponse {
  service: string;
  status: 'UP';
  version: string;
  /** Réplica que respondió (RAILWAY_REPLICA_ID recortado o hostname). */
  replica: string;
  uptimeS: number;
}

@Controller('health')
export class HealthController {
  /** Ruta pública: la usan Railway/Docker para el healthcheck, sin gateway key. */
  @Public()
  @Get()
  health(): HealthResponse {
    return {
      service: config.serviceName,
      status: 'UP',
      version,
      replica: REPLICA,
      uptimeS: Math.round(process.uptime()),
    };
  }
}
