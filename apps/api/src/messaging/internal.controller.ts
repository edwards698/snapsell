import { Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../common/errors.js';
import { Public } from '../common/public.decorator.js';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { assertInternalRequest } from './internal-auth.js';
import { MessagingService } from './messaging.service.js';

/**
 * WhatsApp service → API (BUILD_PLAN D9). Not behind the session guard: every request is
 * checked for a private source address and an HMAC signature over the raw body instead.
 */
@Public()
@Controller('internal/wa')
export class InternalController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly messaging: MessagingService,
  ) {}

  @Post('events')
  @HttpCode(200)
  events(@Req() req: RawBodyRequest<Request>) {
    const raw = this.verify(req);
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Invalid JSON.');
    }
    return this.messaging.handleEvent(payload);
  }

  /** Raw media bytes (`application/octet-stream`); stored privately, type sniffed from the bytes. */
  @Post('media')
  @HttpCode(200)
  media(@Req() req: RawBodyRequest<Request>) {
    return this.messaging.saveMedia(this.verify(req));
  }

  private verify(req: RawBodyRequest<Request>) {
    const raw = req.rawBody ?? (Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    assertInternalRequest(this.config.secrets.internalHmac, req, raw);
    if (!raw.length) throw new ApiError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Empty body.');
    return raw;
  }
}
