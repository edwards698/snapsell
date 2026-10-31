import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { StoreModule } from '../store/store.module.js';
import { AiController } from './ai.controller.js';
import { AiSettingsService } from './ai-settings.service.js';
import { AiClient, AI_PROVIDER } from './ai.provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { AiTurnService } from './turn.service.js';

@Global()
@Module({
  imports: [MessagingModule, StoreModule],
  controllers: [AiController],
  providers: [
    {
      provide: AiClient,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new AiClient(new GeminiProvider(c.ai.geminiApiKey, c.ai.model)),
    },
    { provide: AI_PROVIDER, useExisting: AiClient },
    AiSettingsService,
    AiTurnService,
  ],
  exports: [AI_PROVIDER, AiClient],
})
export class AiModule {}
