import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { config } from '../config';
import { version } from '../version';

export interface HealthResponse {
  service: string;
  status: 'UP';
  version: string;
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
      uptimeS: Math.round(process.uptime()),
    };
  }
}
