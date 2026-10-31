import type { IntegrationKind, JobStatus } from './enums.js';

/** Error body returned by every API endpoint. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    details?: unknown;
  };
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  uptimeSeconds: number;
}

export interface SystemStatus {
  version: string;
  environment: string;
  uptimeSeconds: number;
  database: { ok: boolean; sizeBytes: number; journalMode: string };
  disk: { totalBytes: number; freeBytes: number; usedPercent: number };
  uploads: { publicBytes: number; privateBytes: number };
  jobs: { counts: Record<JobStatus, number>; oldestQueuedSeconds: number | null };
  email: { provider: 'resend' | 'log'; from: string };
  ai: { configured: boolean; model: string };
  integrations: Array<{ kind: IntegrationKind; status: string; detail: string | null }>;
  lastBackupAt: string | null;
}

export interface StoreInfo {
  name: string;
  currency: string;
  deliveryEnabled: boolean;
  collectionEnabled: boolean;
}

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  href: string;
}

export interface Overview {
  shopName: string;
  currency: string;
  counts: { products: number; orders: number; conversations: number; customers: number };
  setup: SetupStep[];
}
