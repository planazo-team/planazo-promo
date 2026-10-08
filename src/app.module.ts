import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { BusModule } from './bus/bus.module';
import { GatewayKeyGuard } from './common/gateway-key.guard';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RolesGuard } from './common/identity';
import { PromoModule } from './promo/promo.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    HealthModule,
    BusModule,
    PromoModule,
  ],
  providers: [
    // Orden de los guards: primero se comprueba que la petición venga del
    // gateway y después el rol del usuario.
    { provide: APP_GUARD, useClass: GatewayKeyGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
