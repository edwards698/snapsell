import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type StockAdjustment,
  stockAdjustmentSchema,
  stockListQuerySchema,
  stockSettingsSchema,
} from '@snapsell/shared';
import { z } from 'zod';
import { Auth } from '../auth/auth.decorator.js';
import { type AuthContext } from '../auth/auth.types.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { InventoryService } from './inventory.service.js';

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1) });

@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Query(new ZodPipe(stockListQuerySchema)) query: z.input<typeof stockListQuerySchema>) {
    return this.inventory.list(query);
  }

  @Get('summary')
  summary() {
    return this.inventory.summary();
  }

  @Get(':variantId')
  row(@Param('variantId') variantId: string) {
    return this.inventory.row(variantId);
  }

  @Post(':variantId/adjust')
  adjust(
    @Param('variantId') variantId: string,
    @Body(new ZodPipe(stockAdjustmentSchema)) body: StockAdjustment,
    @Auth() auth: AuthContext,
  ) {
    return this.inventory.adjust(variantId, body, auth.user.id);
  }

  @Patch(':variantId')
  settings(
    @Param('variantId') variantId: string,
    @Body(new ZodPipe(stockSettingsSchema)) body: z.infer<typeof stockSettingsSchema>,
  ) {
    return this.inventory.setThreshold(variantId, body.lowStockThreshold);
  }

  @Get(':variantId/movements')
  history(
    @Param('variantId') variantId: string,
    @Query(new ZodPipe(pageSchema)) query: z.infer<typeof pageSchema>,
  ) {
    return this.inventory.history(variantId, query.page);
  }
}
