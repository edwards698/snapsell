import 'reflect-metadata';
import { join } from 'node:path';
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { type Logger } from 'pino';
import { AppModule } from './app.module.js';
import { type AppConfig } from './config/config.js';
import { LOGGER } from './logging/logging.module.js';
import { createLogger, PinoNestLogger } from './logging/logger.js';

/** Builds the configured Nest application (used by main.ts and by the e2e tests). */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    logger: new PinoNestLogger(createLogger(config)),
    rawBody: true,
    bufferLogs: true,
  });
  app.useLogger(new PinoNestLogger(app.get<Logger>(LOGGER)));

  // Caddy (and Next.js in development) proxy requests from localhost.
  app.set('trust proxy', 'loopback');
  app.useSecurityHeaders({
    contentSecurityPolicy: {
      directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  // Fetch-Metadata cross-origin protection (Nest 12). Provider webhooks and the WhatsApp service
  // are server-to-server and authenticated by their signature instead.
  app.enableCsrfProtection({
    trustedOrigins: [new URL(config.publicWebUrl).origin],
    exclude: [
      { path: 'webhooks/devdraft', method: RequestMethod.POST },
      { path: 'internal/wa/events', method: RequestMethod.POST },
      { path: 'internal/wa/media', method: RequestMethod.POST },
    ],
  });
  // WhatsApp media arrives as raw bytes from the WhatsApp service.
  app.useBodyParser('raw', {
    type: 'application/octet-stream',
    limit: config.uploads.maxBytes + 1024,
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  // Public product media. Caddy serves this folder directly in production.
  app.use(
    '/media',
    express.static(join(config.paths.uploads, 'public'), {
      immutable: true,
      maxAge: '365d',
      index: false,
      dotfiles: 'deny',
      fallthrough: false,
    }),
  );

  app
    .get<Logger>(LOGGER)
    .info(
      { data: config.paths.data, email: config.email.resendApiKey ? 'resend' : 'log' },
      'API configured',
    );
  return app;
}
