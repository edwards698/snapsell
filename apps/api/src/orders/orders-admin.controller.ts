import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  type CancelOrderInput,
  cancelOrderSchema,
  customerListQuerySchema,
  fulfilmentUpdateSchema,
  type OrderListQuery,
  orderListQuerySchema,
} from '@snapsell/shared';
import { z } from 'zod';
import { Auth } from '../auth/auth.decorator.js';
import { type AuthContext } from '../auth/auth.types.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { OrdersAdminService } from './orders-admin.service.js';

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1) });

@Controller('admin')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersAdminService) {}

  @Get('orders')
  list(@Query(new ZodPipe(orderListQuerySchema)) query: OrderListQuery) {
    return this.orders.list(query);
  }

  @Get('orders/stats')
  stats() {
    return this.orders.stats();
  }

  @Get('orders/:ref')
  get(@Param('ref') ref: string) {
    return this.orders.get(ref);
  }

  @Post('orders/:ref/fulfilment')
  @HttpCode(200)
  fulfil(
    @Param('ref') ref: string,
    @Body(new ZodPipe(fulfilmentUpdateSchema)) body: z.infer<typeof fulfilmentUpdateSchema>,
    @Auth() auth: AuthContext,
  ) {
    return this.orders.setFulfilment(ref, body.status, auth.user.id);
  }

  @Post('orders/:ref/cancel')
  @HttpCode(200)
  cancel(
    @Param('ref') ref: string,
    @Body(new ZodPipe(cancelOrderSchema)) body: CancelOrderInput,
    @Auth() auth: AuthContext,
  ) {
    return this.orders.cancel(ref, body, auth.user.id);
  }

  @Post('orders/:ref/resolve')
  @HttpCode(200)
  resolve(@Param('ref') ref: string, @Auth() auth: AuthContext) {
    return this.orders.resolveAttention(ref, auth.user.id);
  }

  @Post('orders/:ref/payment-link')
  @HttpCode(200)
  paymentLink(@Param('ref') ref: string, @Auth() auth: AuthContext) {
    return this.orders.createPaymentLink(ref, auth.user.id);
  }

  @Post('orders/:ref/check-payment')
  @HttpCode(200)
  checkPayment(@Param('ref') ref: string) {
    return this.orders.checkPayment(ref);
  }

  @Get('payments')
  payments(@Query(new ZodPipe(pageSchema)) q: z.infer<typeof pageSchema>) {
    return this.orders.listPayments(q.page);
  }

  @Get('payments/webhooks')
  webhooks(@Query(new ZodPipe(pageSchema)) q: z.infer<typeof pageSchema>) {
    return this.orders.listWebhookEvents(q.page);
  }

  @Get('customers')
  customers(
    @Query(new ZodPipe(customerListQuerySchema)) q: z.input<typeof customerListQuerySchema>,
  ) {
    return this.orders.customers(q);
  }
}
