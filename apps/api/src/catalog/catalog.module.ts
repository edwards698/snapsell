import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { ProductImageService } from './product-images.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { SnapService } from './snap.service.js';

@Module({
  imports: [
    // Uploads are buffered in memory (size-limited) and validated by content before anything is stored.
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => ({
        limits: { fileSize: c.uploads.maxBytes, files: 12, fields: 20 },
      }),
    }),
  ],
  controllers: [CategoriesController, ProductsController, InventoryController],
  providers: [
    CategoriesService,
    ProductsService,
    ProductImageService,
    InventoryService,
    SnapService,
  ],
  exports: [ProductsService, InventoryService, CategoriesService, ProductImageService],
})
export class CatalogModule {}
