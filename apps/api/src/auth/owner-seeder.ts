import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { type DatabaseHandle } from '@snapsell/db';
import { passwordSchema } from '@snapsell/shared';
import { type Logger } from 'pino';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { LOGGER } from '../logging/logging.module.js';
import { createOwner, findOwner } from './owner.js';

/** Creates the owner account on first boot from OWNER_EMAIL / OWNER_INITIAL_PASSWORD. */
@Injectable()
export class OwnerSeeder implements OnApplicationBootstrap {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onApplicationBootstrap() {
    if (findOwner(this.handle.db)) return;
    const { email, name, initialPassword } = this.config.owner;
    if (!email || !initialPassword) {
      this.logger.warn(
        'No owner account yet. Set OWNER_EMAIL and OWNER_INITIAL_PASSWORD, or run `pnpm reset-owner-password`.',
      );
      return;
    }
    if (!passwordSchema.safeParse(initialPassword).success) {
      this.logger.error('OWNER_INITIAL_PASSWORD is too short; the owner account was not created.');
      return;
    }
    await createOwner(this.handle.db, { email, name, password: initialPassword });
    this.logger.info(
      { email },
      'Created owner account. Remove OWNER_INITIAL_PASSWORD from .env now.',
    );
  }
}
