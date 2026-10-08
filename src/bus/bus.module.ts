import { Global, Module } from '@nestjs/common';
import { BusService } from './bus.service';

/** Módulo global: cualquier módulo puede inyectar BusService sin importarlo. */
@Global()
@Module({
  providers: [BusService],
  exports: [BusService],
})
export class BusModule {}
