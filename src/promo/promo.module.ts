import { Module } from '@nestjs/common';
import { BusModule } from '../bus/bus.module';
import { CLAIM_RATE_LIMIT_STORE, crearClaimRateLimitStore } from './claim-rate-limit.store';
import { ClaimRateLimitGuard } from './claim-rate-limit.guard';
import { PromoController } from './promo.controller';
import { crearPromoRepo, PROMO_REPO } from './promo.repo';
import { PromoService } from './promo.service';
import { crearStockStore, STOCK_STORE } from './stock.store';

@Module({
  imports: [BusModule],
  controllers: [PromoController],
  providers: [
    PromoService,
    ClaimRateLimitGuard,
    { provide: STOCK_STORE, useFactory: crearStockStore },
    { provide: PROMO_REPO, useFactory: crearPromoRepo },
    { provide: CLAIM_RATE_LIMIT_STORE, useFactory: crearClaimRateLimitStore },
  ],
})
export class PromoModule {}
