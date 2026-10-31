import { Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JobWorker } from '../jobs/job-worker.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { OwnerSeeder } from './owner-seeder.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    OwnerSeeder,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly worker: JobWorker,
    private readonly sessions: SessionService,
  ) {}

  onModuleInit() {
    this.worker.register('auth.prune-sessions', () => {
      this.sessions.pruneExpired();
    });
    this.worker.schedule('auth.prune-sessions', 60 * 60 * 1000, 'auth.prune-sessions');
  }
}
