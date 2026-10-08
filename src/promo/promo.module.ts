import { Module } from '@nestjs/common';
import { BusModule } from '../bus/bus.module';
import { PromoController } from './promo.controller';
import { PromoService } from './promo.service';
import { crearStockStore, STOCK_STORE } from './stock.store';

@Module({
  imports: [BusModule],
  controllers: [PromoController],
  providers: [PromoService, { provide: STOCK_STORE, useFactory: crearStockStore }],
})
export class PromoModule {}
