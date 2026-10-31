import { type DynamicModule, Global, Module } from '@nestjs/common';
import { type AppConfig, loadConfig } from './config.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig = loadConfig()): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
