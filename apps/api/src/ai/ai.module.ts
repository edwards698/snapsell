import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { AI_PROVIDER } from './ai.provider.js';
import { GeminiProvider } from './gemini.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new GeminiProvider(c.ai.geminiApiKey, c.ai.model),
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
