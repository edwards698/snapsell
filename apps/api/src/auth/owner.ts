import { type Db, newId, passwordResetTokens, sessions, users } from '@snapsell/db';
import { eq } from 'drizzle-orm';
import { hashPassword } from './password.js';

// Plain functions (no Nest) so the break-glass CLI can share them with the API (BUILD_PLAN D11).

export function findOwner(db: Db) {
  return db.select().from(users).where(eq(users.role, 'OWNER')).get() ?? null;
}

export async function createOwner(
  db: Db,
  input: { email: string; name: string; password: string },
) {
  const id = newId();
  db.insert(users)
    .values({
      id,
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: 'OWNER',
      passwordChangedAt: new Date(),
    })
    .run();
  return id;
}

/** Sets a new password, clears any lockout and outstanding reset links, and signs out everywhere. */
export async function setOwnerPassword(
  db: Db,
  userId: string,
  password: string,
  opts: { keepSessionId?: string } = {},
) {
  const passwordHash = await hashPassword(password);
  db.transaction((tx) => {
    tx.update(users)
      .set({ passwordHash, failedLogins: 0, lockedUntil: null, passwordChangedAt: new Date() })
      .where(eq(users.id, userId))
      .run();
    tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId)).run();
    const all = tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .all();
    for (const s of all) {
      if (s.id !== opts.keepSessionId) tx.delete(sessions).where(eq(sessions.id, s.id)).run();
    }
  });
}
