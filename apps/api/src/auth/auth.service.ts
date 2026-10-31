import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { businessSettings, type DatabaseHandle, passwordResetTokens, users } from '@snapsell/db';
import type { SessionUser } from '@snapsell/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { type Logger } from 'pino';
import { AuditService } from '../common/audit.service.js';
import { ApiError, tooManyRequests } from '../common/errors.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { EmailService } from '../email/email.service.js';
import { LOGGER } from '../logging/logging.module.js';
import { setOwnerPassword } from './owner.js';
import { burnPasswordCheck, verifyPassword } from './password.js';
import { SessionService } from './session.service.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const MINUTE = 60 * 1000;

interface RequestMeta {
  ip: string;
  userAgent: string | null;
}

const invalidCredentials = () =>
  new ApiError(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    'That email and password don’t match.',
  );

const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly sessions: SessionService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta) {
    const ipLimit = this.limiter.hit(`login:ip:${meta.ip}`, 20, 15 * MINUTE);
    if (!ipLimit.allowed) {
      throw tooManyRequests(
        'Too many sign-in attempts. Please wait a few minutes.',
        ipLimit.retryAfterSeconds,
      );
    }

    const { db } = this.handle;
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      await burnPasswordCheck(password);
      throw invalidCredentials();
    }

    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - now) / MINUTE);
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'ACCOUNT_LOCKED',
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`,
        undefined,
        { 'Retry-After': String(Math.ceil((user.lockedUntil.getTime() - now) / 1000)) },
      );
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      const failed = user.failedLogins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      db.update(users)
        .set({
          failedLogins: lock ? 0 : failed,
          lockedUntil: lock ? new Date(now + LOCKOUT_MS) : null,
        })
        .where(eq(users.id, user.id))
        .run();
      this.audit.record({
        actor: 'SYSTEM',
        action: lock ? 'auth.locked' : 'auth.login_failed',
        entity: 'user',
        entityId: user.id,
        ip: meta.ip,
      });
      throw invalidCredentials();
    }

    db.update(users)
      .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(now) })
      .where(eq(users.id, user.id))
      .run();
    const session = this.sessions.create(user.id, meta);
    this.audit.record({
      actor: 'OWNER',
      actorId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      ip: meta.ip,
    });
    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    return { ...session, user: sessionUser };
  }

  logout(sessionId: string, userId: string, ip: string) {
    this.sessions.revoke(sessionId);
    this.audit.record({
      actor: 'OWNER',
      actorId: userId,
      action: 'auth.logout',
      entity: 'user',
      entityId: userId,
      ip,
    });
  }

  /** Always succeeds from the caller's point of view, so it can't be used to discover accounts. */
  forgotPassword(email: string, meta: RequestMeta) {
    const ipLimit = this.limiter.hit(`forgot:ip:${meta.ip}`, 10, 60 * MINUTE);
    if (!ipLimit.allowed) {
      throw tooManyRequests(
        'Too many reset requests. Please try again later.',
        ipLimit.retryAfterSeconds,
      );
    }
    if (!this.limiter.hit(`forgot:email:${email}`, 3, 60 * MINUTE).allowed) return;

    const { db } = this.handle;
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user) return;

    const token = randomBytes(32).toString('base64url');
    db.insert(passwordResetTokens)
      .values({
        tokenHash: hashResetToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      })
      .run();
    const url = `${this.config.publicWebUrl}/admin/reset-password?token=${encodeURIComponent(token)}`;
    this.email.enqueue(user.email, 'password-reset', {
      shopName: this.shopName(),
      name: user.name,
      url,
      expiresMinutes: RESET_TOKEN_TTL_MS / MINUTE,
    });
    if (this.email.provider.name === 'log') {
      // Without Resend configured, the reset link is only available locally.
      this.logger.info(
        'Password reset email written to data/logs/emails (Resend is not configured)',
      );
    }
    this.audit.record({
      actor: 'SYSTEM',
      action: 'auth.reset_requested',
      entity: 'user',
      entityId: user.id,
      ip: meta.ip,
    });
  }

  async resetPassword(token: string, password: string, meta: RequestMeta) {
    const ipLimit = this.limiter.hit(`reset:ip:${meta.ip}`, 10, 15 * MINUTE);
    if (!ipLimit.allowed) {
      throw tooManyRequests(
        'Too many attempts. Please wait a few minutes.',
        ipLimit.retryAfterSeconds,
      );
    }
    const { db } = this.handle;
    const row = db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashResetToken(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .get();
    if (!row) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_RESET_TOKEN',
        'This reset link is invalid or has expired. Request a new one.',
      );
    }
    await setOwnerPassword(db, row.userId, password);
    this.notifyPasswordChanged(row.userId);
    this.audit.record({
      actor: 'OWNER',
      actorId: row.userId,
      action: 'auth.password_reset',
      entity: 'user',
      entityId: row.userId,
      ip: meta.ip,
    });
  }

  async changePassword(
    userId: string,
    sessionId: string,
    current: string,
    next: string,
    ip: string,
  ) {
    const { db } = this.handle;
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user || !(await verifyPassword(user.passwordHash, current))) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Please check the highlighted fields.',
        {
          currentPassword: 'Your current password is incorrect',
        },
      );
    }
    await setOwnerPassword(db, userId, next, { keepSessionId: sessionId });
    this.notifyPasswordChanged(userId);
    this.audit.record({
      actor: 'OWNER',
      actorId: userId,
      action: 'auth.password_changed',
      entity: 'user',
      entityId: userId,
      ip,
    });
  }

  private notifyPasswordChanged(userId: string) {
    const user = this.handle.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return;
    this.email.enqueue(user.email, 'password-changed', {
      shopName: this.shopName(),
      name: user.name,
      when: new Date().toUTCString(),
    });
  }

  private shopName() {
    return (
      this.handle.db.select({ name: businessSettings.name }).from(businessSettings).get()?.name ??
      'SnapSell'
    );
  }
}
