import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { createLogger } from './logger.js';

export const LOGGER = Symbol('LOGGER');

@Global()
@Module({
  providers: [
    { provide: LOGGER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => createLogger(c) },
  ],
  exports: [LOGGER],
})
export class LoggingModule {}
