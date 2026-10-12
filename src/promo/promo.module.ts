import { Module } from '@nestjs/common';
import { BusModule } from '../bus/bus.module';
import { PromoController } from './promo.controller';
import { crearPromoRepo, PROMO_REPO } from './promo.repo';
import { PromoService } from './promo.service';
import { crearStockStore, STOCK_STORE } from './stock.store';

@Module({
  imports: [BusModule],
  controllers: [PromoController],
  providers: [
    PromoService,
    { provide: STOCK_STORE, useFactory: crearStockStore },
    { provide: PROMO_REPO, useFactory: crearPromoRepo },
  ],
})
export class PromoModule {}
