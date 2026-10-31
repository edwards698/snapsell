import { stat } from 'node:fs/promises';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { businessSettings, type DatabaseHandle, integrations, systemState } from '@snapsell/db';
import type {
  HealthResponse,
  IntegrationKind,
  Overview,
  StoreInfo,
  SystemStatus,
} from '@snapsell/shared';
import { eq } from 'drizzle-orm';
import { AI_PROVIDER, type AiProvider } from '../ai/ai.provider.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { EmailService } from '../email/email.service.js';
import { FileStore } from '../files/file-store.js';
import { JobQueue } from '../jobs/job-queue.js';
import { JobWorker } from '../jobs/job-worker.js';

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class SystemService implements OnModuleInit {
  private readonly startedAt = Date.now();
  private usageCache: { at: number; value: SystemStatus['uploads'] } | null = null;

  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly files: FileStore,
    private readonly queue: JobQueue,
    private readonly worker: JobWorker,
    private readonly limiter: RateLimiter,
    private readonly email: EmailService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  onModuleInit() {
    this.worker.register('system.prune', () => {
      this.queue.prune();
      this.limiter.prune(DAY);
    });
    this.worker.schedule('system.prune', 60 * 60 * 1000, 'system.prune');
  }

  health(): HealthResponse {
    this.handle.sqlite.prepare('select 1').get();
    return { ok: true, version: this.config.version, uptimeSeconds: this.uptime() };
  }

  async status(): Promise<SystemStatus> {
    const { sqlite, db } = this.handle;
    const pageCount = sqlite.pragma('page_count', { simple: true }) as number;
    const pageSize = sqlite.pragma('page_size', { simple: true }) as number;
    const journalMode = sqlite.pragma('journal_mode', { simple: true }) as string;
    const walSize = (await stat(`${this.config.paths.database}-wal`).catch(() => null))?.size ?? 0;

    const lastBackup = db
      .select()
      .from(systemState)
      .where(eq(systemState.key, 'last_backup_at'))
      .get();
    return {
      version: this.config.version,
      environment: this.config.env,
      uptimeSeconds: this.uptime(),
      database: { ok: true, sizeBytes: pageCount * pageSize + walSize, journalMode },
      disk: await this.files.disk(),
      uploads: await this.uploadUsage(),
      jobs: this.queue.stats(),
      email: { provider: this.email.provider.name, from: this.config.email.from },
      ai: { configured: this.ai.configured, model: this.ai.model },
      integrations: db
        .select()
        .from(integrations)
        .all()
        .map((i) => ({
          kind: i.kind as IntegrationKind,
          status: i.status,
          detail: (i.metadata.detail as string) ?? null,
        })),
      lastBackupAt: typeof lastBackup?.value === 'string' ? lastBackup.value : null,
    };
  }

  storeInfo(): StoreInfo {
    const s = this.handle.db.select().from(businessSettings).get()!;
    return {
      name: s.name,
      currency: s.currency,
      deliveryEnabled: s.deliveryEnabled,
      collectionEnabled: s.collectionEnabled,
    };
  }

  overview(): Overview {
    const { sqlite, db } = this.handle;
    const count = (table: string) =>
      (sqlite.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
    const settings = db.select().from(businessSettings).get()!;
    const whatsapp = db.select().from(integrations).where(eq(integrations.kind, 'WHATSAPP')).get();
    const devdraft = db.select().from(integrations).where(eq(integrations.kind, 'DEVDRAFT')).get();
    const counts = {
      products: count('products'),
      orders: count('orders'),
      conversations: count('conversations'),
      customers: count('customers'),
    };
    return {
      shopName: settings.name,
      currency: settings.currency,
      counts,
      setup: [
        {
          id: 'email',
          title: 'Set up email',
          description: 'Add a Resend API key so password resets and alerts reach your inbox.',
          done: this.email.provider.name === 'resend',
          href: '/admin/integrations',
        },
        {
          id: 'products',
          title: 'Add your first product',
          description: 'Snap a photo and let the assistant fill in the details.',
          done: counts.products > 0,
          href: '/admin/products',
        },
        {
          id: 'payments',
          title: 'Connect DevDraft payments',
          description: 'Send secure payment links for website and WhatsApp orders.',
          done: devdraft?.status === 'CONNECTED',
          href: '/admin/integrations',
        },
        {
          id: 'whatsapp',
          title: 'Link your WhatsApp number',
          description: 'Scan a QR code to bring customer chats into your inbox.',
          done: whatsapp?.status === 'CONNECTED',
          href: '/admin/integrations',
        },
      ],
    };
  }

  private async uploadUsage() {
    if (this.usageCache && Date.now() - this.usageCache.at < 60_000) return this.usageCache.value;
    const value = await this.files.usage();
    this.usageCache = { at: Date.now(), value };
    return value;
  }

  private uptime() {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }
}
