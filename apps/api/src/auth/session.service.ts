import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, sessions, users } from '@snapsell/db';
import type { SessionUser } from '@snapsell/shared';
import { and, eq, lt, ne, or } from 'drizzle-orm';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';

export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export interface ValidSession {
  id: string;
  csrfToken: string;
  expiresAt: Date;
  user: SessionUser;
}

/**
 * Opaque server-side sessions. The cookie holds a random token; the database stores only an
 * HMAC of it, so a leaked database cannot be used to hijack sessions.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  hashToken(token: string) {
    return createHmac('sha256', this.config.secrets.session).update(token).digest('hex');
  }

  create(userId: string, meta: { ip: string | null; userAgent: string | null }, now = Date.now()) {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = new Date(now + SESSION_ABSOLUTE_MS);
    this.handle.db
      .insert(sessions)
      .values({
        id: this.hashToken(token),
        userId,
        csrfToken,
        expiresAt,
        idleExpiresAt: new Date(now + SESSION_IDLE_MS),
        lastSeenAt: new Date(now),
        ip: meta.ip,
        userAgent: meta.userAgent,
      })
      .run();
    return { token, csrfToken, expiresAt };
  }

  /** Returns the session for a cookie token, sliding its idle expiry, or null if invalid. */
  validate(token: string, now = Date.now()): ValidSession | null {
    const id = this.hashToken(token);
    const row = this.handle.db
      .select({
        id: sessions.id,
        csrfToken: sessions.csrfToken,
        expiresAt: sessions.expiresAt,
        idleExpiresAt: sessions.idleExpiresAt,
        lastSeenAt: sessions.lastSeenAt,
        userId: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, id))
      .get();
    if (!row) return null;
    if (row.expiresAt.getTime() <= now || row.idleExpiresAt.getTime() <= now) {
      this.revoke(id);
      return null;
    }
    if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      this.handle.db
        .update(sessions)
        .set({ lastSeenAt: new Date(now), idleExpiresAt: new Date(now + SESSION_IDLE_MS) })
        .where(eq(sessions.id, id))
        .run();
    }
    return {
      id: row.id,
      csrfToken: row.csrfToken,
      expiresAt: row.expiresAt,
      user: { id: row.userId, email: row.email, name: row.name, role: row.role },
    };
  }

  revoke(sessionId: string) {
    this.handle.db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  }

  /** Revokes every session of a user, optionally keeping the current one. */
  revokeAllForUser(userId: string, exceptSessionId?: string) {
    const where = exceptSessionId
      ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
      : eq(sessions.userId, userId);
    return this.handle.db.delete(sessions).where(where).run().changes;
  }

  pruneExpired(now = Date.now()) {
    const t = new Date(now);
    return this.handle.db
      .delete(sessions)
      .where(or(lt(sessions.expiresAt, t), lt(sessions.idleExpiresAt, t)))
      .run().changes;
  }
}
