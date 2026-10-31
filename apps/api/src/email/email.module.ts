import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { LogEmailProvider, ResendEmailProvider } from './email.provider.js';
import { EmailService } from './email.service.js';
import { EMAIL_PROVIDER } from './email.tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.email.resendApiKey
          ? new ResendEmailProvider(config.email.resendApiKey, config.email.from)
          : new LogEmailProvider(join(config.paths.logs, 'emails')),
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
