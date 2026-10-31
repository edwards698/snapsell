import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Logger } from 'pino';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { LOGGER } from '../logging/logging.module.js';
import { JobQueue, type JobRow } from './job-queue.js';

export type JobHandler<T = unknown> = (payload: T, job: JobRow) => Promise<void> | void;

interface Registration {
  handler: JobHandler;
  concurrency: number;
  lockMs: number;
  running: number;
}

interface Schedule {
  name: string;
  everyMs: number;
  queue: string;
  payload: unknown;
  lastSlot: number | null;
}

const MAX_TOTAL_CONCURRENCY = 8;

/**
 * Runs queued jobs inside the API process and enqueues recurring jobs (BUILD_PLAN D17).
 * Modules register handlers in `onModuleInit`; polling starts once the app has bootstrapped.
 */
@Injectable()
export class JobWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly handlers = new Map<string, Registration>();
  private readonly schedules: Schedule[] = [];
  private readonly inFlight = new Set<Promise<void>>();
  private timer: NodeJS.Timeout | null = null;
  private ticks = 0;
  private stopping = false;
  /** Tests disable automatic polling and drive the worker with `drain()`. */
  autoStart = true;

  constructor(
    private readonly queue: JobQueue,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  register<T>(
    queue: string,
    handler: JobHandler<T>,
    opts: { concurrency?: number; lockMs?: number } = {},
  ) {
    if (this.handlers.has(queue)) throw new Error(`Job handler for "${queue}" already registered`);
    this.handlers.set(queue, {
      handler: handler as JobHandler,
      concurrency: opts.concurrency ?? 1,
      lockMs: opts.lockMs ?? 5 * 60 * 1000,
      running: 0,
    });
  }

  /** Enqueues `queue` once per `everyMs` slot; the dedupe key keeps restarts from doubling runs. */
  schedule(name: string, everyMs: number, queue: string, payload: unknown = {}) {
    this.schedules.push({ name, everyMs, queue, payload, lastSlot: null });
  }

  onApplicationBootstrap() {
    const recovered = this.queue.recoverInterrupted();
    if (recovered) this.logger.warn({ recovered }, 'Re-queued jobs interrupted by a restart');
    if (this.autoStart) this.start();
  }

  start() {
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => this.tick(), this.config.jobs.pollMs);
    this.timer.unref();
    this.tick();
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.race([
      Promise.allSettled([...this.inFlight]),
      new Promise((r) => setTimeout(r, 10_000)),
    ]);
  }

  /** Runs everything due (including jobs queued while draining), waiting for handlers. Used by tests. */
  async drain(atTime?: number) {
    let ran = 0;
    for (;;) {
      // Without a fixed time, jobs queued by handlers during the drain are picked up too.
      const now = atTime ?? Date.now();
      this.enqueueSchedules(now);
      const started = this.startJobs(now);
      if (started.length === 0 && this.inFlight.size === 0) return ran;
      ran += started.length;
      await Promise.allSettled(started.length ? started : [...this.inFlight]);
    }
  }

  private tick() {
    if (this.stopping) return;
    try {
      const now = Date.now();
      this.enqueueSchedules(now);
      // Lock expiry is rare; checking every ~10 s is plenty.
      if (++this.ticks % 40 === 0) this.queue.failExpiredLocks(now);
      this.startJobs(now);
    } catch (err) {
      this.logger.error({ err }, 'Job worker tick failed');
    }
  }

  private enqueueSchedules(now: number) {
    for (const s of this.schedules) {
      const slot = Math.floor(now / s.everyMs);
      if (s.lastSlot === slot) continue;
      s.lastSlot = slot;
      this.queue.enqueue(s.queue, s.payload, {
        dedupeKey: `schedule:${s.name}:${slot}`,
        runAt: now,
        maxAttempts: 1,
      });
    }
  }

  private startJobs(now: number): Promise<void>[] {
    const started: Promise<void>[] = [];
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const [queue, reg] of this.handlers) {
        if (this.inFlight.size >= MAX_TOTAL_CONCURRENCY) return started;
        if (reg.running >= reg.concurrency) continue;
        const job = this.queue.claim([queue], reg.lockMs, now);
        if (!job) continue;
        started.push(this.run(job));
        progressed = true;
      }
    }
    return started;
  }

  private run(job: JobRow): Promise<void> {
    const reg = this.handlers.get(job.queue)!;
    reg.running++;
    const promise = (async () => {
      try {
        await reg.handler(job.payload, job);
        this.queue.complete(job.id);
      } catch (err) {
        const result = this.queue.fail(job, err);
        const log = result === 'FAILED' ? this.logger.error : this.logger.warn;
        log.call(
          this.logger,
          { err, jobId: job.id, queue: job.queue, attempt: job.attempts, result },
          'Job failed',
        );
      } finally {
        reg.running--;
      }
    })();
    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise));
    return promise;
  }
}
