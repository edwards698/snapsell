import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import {
  type CartInput,
  cartSchema,
  type CheckoutInput,
  type CheckoutResult,
  checkoutSchema,
  type StoreListQuery,
  storeListQuerySchema,
} from '@snapsell/shared';
import type { Request } from 'express';
import { tooManyRequests } from '../common/errors.js';
import { Public } from '../common/public.decorator.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { clientIp } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { OrdersService } from '../orders/orders.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { StorefrontService } from './storefront.service.js';

const MINUTE = 60_000;

/** Public storefront API: no account needed (spec §2.2). */
@Public()
@Controller('store')
export class StoreController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly orders: OrdersService,
    private readonly limiter: RateLimiter,
    private readonly payments: PaymentsService,
  ) {}

  @Get('categories')
  categories() {
    return this.storefront.categories();
  }

  @Get('products')
  list(@Query(new ZodPipe(storeListQuerySchema)) query: StoreListQuery) {
    return this.storefront.list(query);
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.storefront.product(slug);
  }

  @Post('cart/price')
  @HttpCode(200)
  price(@Body(new ZodPipe(cartSchema)) body: CartInput, @Req() req: Request) {
    this.limit(`cart:${clientIp(req)}`, 120, MINUTE);
    return this.storefront.priceCart(body);
  }

  @Post('checkout')
  async checkout(
    @Body(new ZodPipe(checkoutSchema)) body: CheckoutInput,
    @Req() req: Request,
  ): Promise<CheckoutResult> {
    this.limit(`checkout:${clientIp(req)}`, 10, 10 * MINUTE);
    const order = this.orders.createFromCheckout(body);
    // The order stands even if the link fails; the owner sees it under Needs attention.
    let paymentUrl: string | null = null;
    try {
      paymentUrl = (await this.payments.createLinkForOrder(order.orderId, { type: 'SYSTEM' }))
        .paymentUrl;
    } catch {
      paymentUrl = this.payments.activePaymentUrl(order.orderId);
    }
    return { ref: order.ref, statusToken: order.statusToken, paymentUrl };
  }

  @Get('orders/:ref')
  order(@Param('ref') ref: string, @Query('t') token: string, @Req() req: Request) {
    this.limit(`order-lookup:${clientIp(req)}`, 60, MINUTE);
    return this.orders.publicOrder(ref, token);
  }

  private limit(key: string, max: number, windowMs: number) {
    const r = this.limiter.hit(key, max, windowMs);
    if (!r.allowed)
      throw tooManyRequests(
        'Too many requests. Please wait a moment and try again.',
        r.retryAfterSeconds,
      );
  }
}
