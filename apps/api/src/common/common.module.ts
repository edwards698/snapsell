import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { RateLimiter } from './rate-limiter.js';

@Global()
@Module({ providers: [RateLimiter, AuditService], exports: [RateLimiter, AuditService] })
export class CommonModule {}
