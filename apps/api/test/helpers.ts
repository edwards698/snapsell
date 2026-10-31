import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { type AppConfig, loadConfig } from '../src/config/config.js';
import { EMAIL_PROVIDER } from '../src/email/email.tokens.js';
import { type LogEmailProvider } from '../src/email/email.provider.js';
import { JobWorker } from '../src/jobs/job-worker.js';

export const ORIGIN = 'http://localhost:3000';
export const OWNER = { email: 'owner@example.com', password: 'correct-horse-battery' };

export function testConfig(env: Record<string, string> = {}): AppConfig {
  const dataDir = mkdtempSync(join(tmpdir(), 'snapsell-test-'));
  return loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    PUBLIC_WEB_URL: ORIGIN,
    SESSION_SECRET: 'test-session-secret-0123456789abcdef',
    FILE_SIGNING_SECRET: 'test-file-secret-0123456789abcdefgh',
    OWNER_EMAIL: OWNER.email,
    OWNER_INITIAL_PASSWORD: OWNER.password,
    ...env,
  });
}

export interface TestApp {
  app: INestApplication;
  config: AppConfig;
  http: () => ReturnType<typeof request.agent>;
  worker: JobWorker;
  emails: LogEmailProvider;
  close: () => Promise<void>;
}

export async function startTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const config = testConfig(env);
  const app = await createApp(config);
  const worker = app.get(JobWorker);
  worker.autoStart = false;
  await app.init();
  return {
    app,
    config,
    worker,
    emails: app.get<LogEmailProvider>(EMAIL_PROVIDER),
    http: () => request.agent(app.getHttpServer()).set('Origin', ORIGIN),
    close: async () => {
      await app.close();
      rmSync(config.paths.data, { recursive: true, force: true });
    },
  };
}

/** Signs in and returns an agent that carries the session cookie and CSRF header. */
export async function signIn(t: TestApp, creds = OWNER) {
  const agent = t.http();
  const res = await agent.post('/api/admin/auth/login').send(creds).expect(200);
  const csrf = (res.body as { csrfToken: string }).csrfToken;
  return { agent, csrf };
}
