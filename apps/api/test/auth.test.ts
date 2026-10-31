import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCKOUT_MS, MAX_FAILED_LOGINS } from '../src/auth/auth.service.js';
import { OWNER, signIn, startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
beforeEach(async () => {
  t = await startTestApp();
});
afterEach(async () => {
  await t.close();
});

function cookies(res: { headers: Record<string, unknown> }) {
  return ([res.headers['set-cookie']].flat().filter(Boolean) as string[]).join('\n');
}

describe('login', () => {
  it('creates the owner on first boot and signs in with HttpOnly session + readable CSRF cookies', async () => {
    const res = await t
      .http()
      .post('/api/admin/auth/login')
      .send({ email: 'OWNER@example.com', password: OWNER.password })
      .expect(200);
    expect(res.body.user).toMatchObject({ email: OWNER.email, role: 'OWNER' });
    expect(res.body.csrfToken).toEqual(expect.any(String));
    const set = cookies(res);
    expect(set).toMatch(/ss_session=[^;]+;.*HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    expect(set).not.toMatch(/ss_csrf=[^;]+;.*HttpOnly/);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await t
      .http()
      .post('/api/admin/auth/login')
      .send({ ...OWNER, password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await t
      .http()
      .post('/api/admin/auth/login')
      .send({ email: 'nobody@example.com', password: 'x' })
      .expect(401);
    expect(unknown.body.error.message).toBe(res.body.error.message);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await t
        .http()
        .post('/api/admin/auth/login')
        .send({ ...OWNER, password: 'wrong' })
        .expect(401);
    }
    const locked = await t.http().post('/api/admin/auth/login').send(OWNER).expect(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(locked.headers['retry-after'])).toBeLessThanOrEqual(LOCKOUT_MS / 1000);
  });

  it('validates input with per-field messages', async () => {
    const res = await t
      .http()
      .post('/api/admin/auth/login')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(res.body.error.fields).toMatchObject({
      email: expect.any(String),
      password: 'Enter your password',
    });
  });
});

describe('sessions and CSRF', () => {
  it('requires a session for /me and accepts a valid one', async () => {
    await t.http().get('/api/admin/auth/me').expect(401);
    const { agent } = await signIn(t);
    const me = await agent.get('/api/admin/auth/me').expect(200);
    expect(me.body.user.email).toBe(OWNER.email);
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const { agent, csrf } = await signIn(t);
    const res = await agent.post('/api/admin/auth/logout').expect(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
    await agent
      .post('/api/admin/auth/logout')
      .set('x-csrf-token', 'x'.repeat(csrf.length))
      .expect(403);
  });

  it('rejects cross-site requests before they reach the handler', async () => {
    const { agent, csrf } = await signIn(t);
    await agent
      .post('/api/admin/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('x-csrf-token', csrf)
      .expect(403);
    await agent.get('/api/admin/auth/me').expect(200);
  });

  it('logs out and invalidates the session', async () => {
    const { agent, csrf } = await signIn(t);
    await agent.post('/api/admin/auth/logout').set('x-csrf-token', csrf).expect(204);
    await agent.get('/api/admin/auth/me').expect(401);
  });
});

describe('password reset', () => {
  async function requestResetToken() {
    await t.http().post('/api/admin/auth/forgot-password').send({ email: OWNER.email }).expect(202);
    await t.worker.drain();
    const email = t.emails.sent.find((e) => e.subject.includes('Reset'));
    expect(email).toBeDefined();
    const match = /reset-password\?token=([\w%-]+)/.exec(email!.text);
    return decodeURIComponent(match![1]!);
  }

  it('emails a single-use link that sets a new password and signs out every session', async () => {
    const { agent: oldSession } = await signIn(t);
    const token = await requestResetToken();

    await t
      .http()
      .post('/api/admin/auth/reset-password')
      .send({ token, password: 'too-short' })
      .expect(400);
    await t
      .http()
      .post('/api/admin/auth/reset-password')
      .send({ token, password: 'a-brand-new-password' })
      .expect(200);
    await t
      .http()
      .post('/api/admin/auth/reset-password')
      .send({ token, password: 'another-new-password' })
      .expect(400);

    await oldSession.get('/api/admin/auth/me').expect(401);
    await t.http().post('/api/admin/auth/login').send(OWNER).expect(401);
    await signIn(t, { email: OWNER.email, password: 'a-brand-new-password' });

    await t.worker.drain();
    expect(t.emails.sent.some((e) => e.subject.includes('was changed'))).toBe(true);
  });

  it('answers the same way for unknown emails and sends nothing', async () => {
    const res = await t
      .http()
      .post('/api/admin/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(202);
    expect(res.body).toEqual({ ok: true });
    await t.worker.drain();
    expect(t.emails.sent).toHaveLength(0);
  });

  it('clears a lockout', async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await t
        .http()
        .post('/api/admin/auth/login')
        .send({ ...OWNER, password: 'wrong' });
    }
    const token = await requestResetToken();
    await t
      .http()
      .post('/api/admin/auth/reset-password')
      .send({ token, password: 'a-brand-new-password' })
      .expect(200);
    await signIn(t, { email: OWNER.email, password: 'a-brand-new-password' });
  });
});

describe('change password', () => {
  it('requires the current password and keeps only the current session', async () => {
    const { agent, csrf } = await signIn(t);
    const { agent: other } = await signIn(t);

    const bad = await agent
      .post('/api/admin/auth/change-password')
      .set('x-csrf-token', csrf)
      .send({ currentPassword: 'wrong', newPassword: 'a-brand-new-password' })
      .expect(400);
    expect(bad.body.error.fields.currentPassword).toBeDefined();

    await agent
      .post('/api/admin/auth/change-password')
      .set('x-csrf-token', csrf)
      .send({ currentPassword: OWNER.password, newPassword: 'a-brand-new-password' })
      .expect(200);
    await agent.get('/api/admin/auth/me').expect(200);
    await other.get('/api/admin/auth/me').expect(401);
  });
});
