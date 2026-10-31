import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { OrdersAdminController } from '../orders/orders-admin.controller.js';
import { OrdersAdminService } from '../orders/orders-admin.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { DevDraftProvider } from '../payments/devdraft.provider.js';
import { FakePaymentProvider } from '../payments/fake.provider.js';
import { PAYMENT_PROVIDER } from '../payments/payment.provider.js';
import { PaymentsService } from '../payments/payments.service.js';
import { WebhooksController } from '../payments/webhooks.controller.js';
import { ShopSettingsController } from './shop-settings.controller.js';
import { StoreController } from './store.controller.js';
import { StorefrontService } from './storefront.service.js';

/** Storefront, orders and payments: everything between a cart and a paid order. */
@Module({
  imports: [CatalogModule],
  controllers: [StoreController, ShopSettingsController, OrdersAdminController, WebhooksController],
  providers: [
    StorefrontService,
    OrdersService,
    OrdersAdminService,
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        c.devdraft.mode === 'fake'
          ? new FakePaymentProvider(c.devdraft, c.publicWebUrl)
          : new DevDraftProvider(c.devdraft),
    },
  ],
  exports: [OrdersService, StorefrontService, PaymentsService],
})
export class StoreModule {}
