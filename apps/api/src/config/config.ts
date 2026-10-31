import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { REPO_ROOT } from '../paths.js';

const secret = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters (run \`pnpm setup\` to generate one)`);

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATA_DIR: z.string().default(resolve(REPO_ROOT, 'data')),
  PUBLIC_WEB_URL: z.url().default('http://localhost:3000'),
  SESSION_SECRET: secret('SESSION_SECRET'),
  FILE_SIGNING_SECRET: secret('FILE_SIGNING_SECRET'),
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.string().default('SnapSell <onboarding@resend.dev>'),
  OWNER_EMAIL: optionalString.pipe(z.email().optional()),
  OWNER_NAME: z.string().default('Shop owner'),
  OWNER_INITIAL_PASSWORD: optionalString,
  MAX_UPLOAD_MB: z.coerce.number().positive().max(100).default(15),
  GEMINI_API_KEY: optionalString,
  // Verified 2026-10-31: stable, accepts image + audio input and JSON-schema output.
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  JOB_POLL_MS: z.coerce.number().int().positive().default(250),
  // DevDraft (BUILD_PLAN §7). `fake` simulates links and signed webhooks locally; never in production.
  DEVDRAFT_MODE: z.enum(['fake', 'sandbox', 'live']).default('fake'),
  DEVDRAFT_BASE_URL: z.url().default('https://api.devdraft.com'),
  DEVDRAFT_CLIENT_KEY: optionalString,
  DEVDRAFT_CLIENT_SECRET: optionalString,
  DEVDRAFT_WEBHOOK_SECRET: optionalString,
  DEVDRAFT_SIGNATURE_HEADER: z.string().default('x-webhook-signature'),
  DEVDRAFT_LINK_TYPE: z
    .enum(['PRODUCT', 'DONATION', 'INVOICE', 'SUBSCRIPTION', 'COLLECTION'])
    .default('INVOICE'),
  DEVDRAFT_CURRENCIES: z.string().default('usdc,eurc'),
  /** Response field holding the customer-facing URL – not in the published docs; confirm with DevDraft. */
  DEVDRAFT_PAYMENT_URL_FIELD: optionalString,
  /** Alternative once DevDraft confirms the format, e.g. https://pay.example.com/{url}. */
  DEVDRAFT_PAYMENT_URL_TEMPLATE: optionalString,
  // WhatsApp service (BUILD_PLAN D9). Signs API <-> service calls; derived from SESSION_SECRET in
  // development when unset, required in production.
  INTERNAL_HMAC_SECRET: optionalString.pipe(z.string().min(32).optional()),
  WHATSAPP_SERVICE_URL: z.url().default('http://127.0.0.1:4100'),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  port: number;
  host: string;
  logLevel: Env['LOG_LEVEL'];
  version: string;
  publicWebUrl: string;
  /** Secure cookies whenever the public site is served over HTTPS. */
  cookieSecure: boolean;
  paths: {
    data: string;
    database: string;
    uploads: string;
    logs: string;
    backups: string;
  };
  secrets: { session: string; fileSigning: string; internalHmac: string };
  whatsapp: { serviceUrl: string };
  email: { resendApiKey?: string; from: string };
  owner: { email?: string; name: string; initialPassword?: string };
  uploads: { maxBytes: number };
  jobs: { pollMs: number };
  ai: { geminiApiKey?: string; model: string };
  devdraft: {
    mode: 'fake' | 'sandbox' | 'live';
    baseUrl: string;
    clientKey?: string;
    clientSecret?: string;
    webhookSecret: string;
    signatureHeader: string;
    linkType: string;
    currencies: string[];
    paymentUrlField?: string;
    paymentUrlTemplate?: string;
  };
}

export class ConfigError extends Error {}

/** Must match `internalSecret()` in apps/whatsapp, which reads the same .env. */
export function deriveInternalSecret(sessionSecret: string) {
  return createHmac('sha256', sessionSecret).update('snapsell-internal-hmac').digest('base64url');
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const data = resolve(e.DATA_DIR);
  if (e.DEVDRAFT_MODE === 'fake' && e.NODE_ENV === 'production') {
    throw new ConfigError(
      'Invalid configuration:\n  - DEVDRAFT_MODE: "fake" is for development only; use "sandbox" or "live"',
    );
  }
  if (!e.INTERNAL_HMAC_SECRET && e.NODE_ENV === 'production') {
    throw new ConfigError(
      'Invalid configuration:\n  - INTERNAL_HMAC_SECRET: required in production (run `pnpm setup` to generate one)',
    );
  }
  if (e.DEVDRAFT_MODE !== 'fake') {
    const missing = (
      ['DEVDRAFT_CLIENT_KEY', 'DEVDRAFT_CLIENT_SECRET', 'DEVDRAFT_WEBHOOK_SECRET'] as const
    ).filter((k) => !e[k]);
    if (missing.length)
      throw new ConfigError(
        `Invalid configuration:\n${missing.map((k) => `  - ${k}: required when DEVDRAFT_MODE is ${e.DEVDRAFT_MODE}`).join('\n')}`,
      );
  }
  return {
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    version: process.env.npm_package_version ?? '0.1.0',
    publicWebUrl: e.PUBLIC_WEB_URL.replace(/\/$/, ''),
    cookieSecure: e.PUBLIC_WEB_URL.startsWith('https://'),
    paths: {
      data,
      database: resolve(data, 'db/snapsell.db'),
      uploads: resolve(data, 'uploads'),
      logs: resolve(data, 'logs'),
      backups: resolve(data, 'backups'),
    },
    secrets: {
      session: e.SESSION_SECRET,
      fileSigning: e.FILE_SIGNING_SECRET,
      internalHmac: e.INTERNAL_HMAC_SECRET ?? deriveInternalSecret(e.SESSION_SECRET),
    },
    whatsapp: { serviceUrl: e.WHATSAPP_SERVICE_URL.replace(/\/$/, '') },
    email: { resendApiKey: e.RESEND_API_KEY, from: e.EMAIL_FROM },
    owner: { email: e.OWNER_EMAIL, name: e.OWNER_NAME, initialPassword: e.OWNER_INITIAL_PASSWORD },
    uploads: { maxBytes: Math.round(e.MAX_UPLOAD_MB * 1024 * 1024) },
    jobs: { pollMs: e.JOB_POLL_MS },
    ai: { geminiApiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL },
    devdraft: {
      mode: e.DEVDRAFT_MODE,
      baseUrl: e.DEVDRAFT_BASE_URL.replace(/\/$/, ''),
      clientKey: e.DEVDRAFT_CLIENT_KEY,
      clientSecret: e.DEVDRAFT_CLIENT_SECRET,
      // Fake mode signs its simulated webhooks with a key derived from the session secret.
      webhookSecret: e.DEVDRAFT_WEBHOOK_SECRET ?? `fake-${e.SESSION_SECRET}`,
      signatureHeader: e.DEVDRAFT_SIGNATURE_HEADER.toLowerCase(),
      linkType: e.DEVDRAFT_LINK_TYPE,
      currencies: e.DEVDRAFT_CURRENCIES.split(',')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
      paymentUrlField: e.DEVDRAFT_PAYMENT_URL_FIELD,
      paymentUrlTemplate: e.DEVDRAFT_PAYMENT_URL_TEMPLATE,
    },
  };
}
