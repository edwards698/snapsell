import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../common/errors.js';
import { Public } from '../common/public.decorator.js';
import { PaymentsService } from './payments.service.js';

@Public()
@Controller()
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  /** DevDraft → us. Verified over the raw bytes (spec §7.4); 2xx tells DevDraft not to retry. */
  @Post('webhooks/devdraft')
  @HttpCode(200)
  devdraft(@Req() req: RawBodyRequest<Request>) {
    if (!req.rawBody?.length)
      throw new ApiError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Empty body.');
    const result = this.payments.receiveWebhook(req.rawBody, req.headers);
    if (result === 'invalid_signature')
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'INVALID_SIGNATURE', 'Signature did not verify.');
    return { received: true, duplicate: result === 'duplicate' };
  }

  // --- Test mode (DEVDRAFT_MODE=fake) – 404 otherwise ------------------------

  @Get('test-payments/:linkId')
  testLink(@Param('linkId') linkId: string) {
    return this.payments.testLink(linkId);
  }

  @Post('test-payments/:linkId/:outcome')
  @HttpCode(200)
  simulate(@Param('linkId') linkId: string, @Param('outcome') outcome: string) {
    if (outcome !== 'completed' && outcome !== 'failed')
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found.');
    return { result: this.payments.simulate(linkId, outcome) };
  }
}
