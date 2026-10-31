import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { type DatabaseHandle, openDatabase, runMigrations } from '@snapsell/db';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';

export const DATABASE = Symbol('DATABASE');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DatabaseHandle => {
        const handle = openDatabase(config.paths.database);
        runMigrations(handle);
        return handle;
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle) {}

  onApplicationShutdown() {
    this.handle.close();
  }
}
