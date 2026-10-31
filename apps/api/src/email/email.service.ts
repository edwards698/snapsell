import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { type DatabaseHandle, emailLog, integrations, newId } from '@snapsell/db';
import { eq } from 'drizzle-orm';
import { type Logger } from 'pino';
import { DATABASE } from '../database/database.module.js';
import { JobQueue, type JobRow } from '../jobs/job-queue.js';
import { JobWorker } from '../jobs/job-worker.js';
import { LOGGER } from '../logging/logging.module.js';
import { EMAIL_PROVIDER } from './email.tokens.js';
import { type EmailProvider } from './email.provider.js';
import { type TemplateData, type TemplateName, templates } from './templates.js';

interface EmailJob<T extends TemplateName = TemplateName> {
  to: string;
  template: T;
  data: TemplateData<T>;
}

/** Emails are sent from the job queue so a slow or failing provider never blocks a request. */
@Injectable()
export class EmailService implements OnModuleInit {
  constructor(
    @Inject(EMAIL_PROVIDER) readonly provider: EmailProvider,
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly queue: JobQueue,
    private readonly worker: JobWorker,
  ) {}

  onModuleInit() {
    const configured = this.provider.name === 'resend';
    this.handle.db
      .update(integrations)
      .set({
        status: configured ? 'CONFIGURED' : 'NOT_CONFIGURED',
        metadata: { detail: configured ? null : 'Emails are written to data/logs/emails' },
      })
      .where(eq(integrations.kind, 'RESEND'))
      .run();
    this.worker.register<EmailJob>('email.send', (payload, job) => this.deliver(payload, job), {
      concurrency: 2,
      lockMs: 60_000,
    });
  }

  enqueue<T extends TemplateName>(to: string, template: T, data: TemplateData<T>) {
    return this.queue.enqueue<EmailJob<T>>(
      'email.send',
      { to, template, data },
      { maxAttempts: 6 },
    );
  }

  private async deliver({ to, template, data }: EmailJob, job: JobRow) {
    const render = templates[template] as (
      d: typeof data,
    ) => ReturnType<(typeof templates)[TemplateName]>;
    const email = { to, ...render(data) };
    try {
      const { id } = await this.provider.send(email, job.id);
      this.log(to, template, this.provider.name === 'log' ? 'LOGGED' : 'SENT', id, null);
      this.logger.info({ template, provider: this.provider.name }, 'Email delivered');
    } catch (err) {
      this.log(to, template, 'FAILED', null, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  private log(
    to: string,
    template: string,
    status: 'SENT' | 'LOGGED' | 'FAILED',
    providerId: string | null,
    error: string | null,
  ) {
    this.handle.db
      .insert(emailLog)
      .values({ id: newId(), to, template, status, providerId, error })
      .run();
  }
}
