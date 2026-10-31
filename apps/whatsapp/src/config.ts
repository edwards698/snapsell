import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export interface ServiceConfig {
  env: string;
  host: string;
  port: number;
  apiUrl: string;
  secret: string;
  logLevel: string;
  paths: {
    /** whatsapp-web.js LocalAuth session – never backed up unencrypted. */
    auth: string;
    /** Inbound messages and acks waiting for the API. */
    journal: string;
    /** Small state files (enabled flag, sent refs). */
    state: string;
  };
  /** Chrome/Edge binary for Puppeteer; detected when unset. */
  chromePath: string | undefined;
  maxMediaBytes: number;
  /** Minimum and maximum pause between outgoing messages (looks less like a bot). */
  sendGapMs: [number, number];
}

export class ConfigError extends Error {}

/** Must match `deriveInternalSecret()` in apps/api, which reads the same .env. */
export function internalSecret(env: NodeJS.ProcessEnv) {
  if (env.INTERNAL_HMAC_SECRET?.trim()) return env.INTERNAL_HMAC_SECRET.trim();
  if (env.NODE_ENV === 'production') {
    throw new ConfigError('INTERNAL_HMAC_SECRET is required in production.');
  }
  if (!env.SESSION_SECRET) {
    throw new ConfigError('Set INTERNAL_HMAC_SECRET (or SESSION_SECRET) – run `pnpm setup`.');
  }
  return createHmac('sha256', env.SESSION_SECRET)
    .update('snapsell-internal-hmac')
    .digest('base64url');
}

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

export function detectChrome(env: NodeJS.ProcessEnv) {
  if (env.CHROME_PATH?.trim()) return env.CHROME_PATH.trim();
  return CHROME_CANDIDATES.find((p) => existsSync(p));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const serviceUrl = new URL(env.WHATSAPP_SERVICE_URL || 'http://127.0.0.1:4100');
  const data = resolve(env.DATA_DIR || resolve(REPO_ROOT, 'data'));
  const apiPort = env.PORT || '4000';
  return {
    env: env.NODE_ENV || 'development',
    host: env.WHATSAPP_HOST || serviceUrl.hostname,
    port: Number(serviceUrl.port || 4100),
    apiUrl: (env.API_URL || `http://127.0.0.1:${apiPort}`).replace(/\/$/, ''),
    secret: internalSecret(env),
    logLevel: env.LOG_LEVEL || 'info',
    paths: {
      auth: resolve(data, 'wwebjs'),
      journal: resolve(data, 'whatsapp/journal'),
      state: resolve(data, 'whatsapp'),
    },
    chromePath: detectChrome(env),
    maxMediaBytes: Math.round(Number(env.MAX_UPLOAD_MB || 15) * 1024 * 1024),
    sendGapMs: [1200, 3000],
  };
}
