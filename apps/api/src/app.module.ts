import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, DiscoveryModule } from '@nestjs/core';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CommonModule } from './common/common.module.js';
import { EventsModule } from './common/events.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { ConfigModule } from './config/config.module.js';
import { type AppConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { EmailModule } from './email/email.module.js';
import { FilesModule } from './files/files.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { StoreModule } from './store/store.module.js';
import { SystemModule } from './system/system.module.js';

@Module({})
export class AppModule {
  static forRoot(config?: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DiscoveryModule,
        LoggingModule,
        DatabaseModule,
        CommonModule,
        EventsModule,
        JobsModule,
        FilesModule,
        EmailModule,
        AiModule,
        AuthModule,
        CatalogModule,
        StoreModule,
        SystemModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    };
  }
}
