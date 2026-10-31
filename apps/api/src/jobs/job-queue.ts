import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, newId } from '@snapsell/db';
import type { JobStatus } from '@snapsell/shared';
import { DATABASE } from '../database/database.module.js';

export interface EnqueueOptions {
  /** A second enqueue with the same key is ignored and returns the existing job (BUILD_PLAN D17). */
  dedupeKey?: string;
  /** Jobs sharing a group key never run at the same time (e.g. one AI turn per conversation). */
  groupKey?: string;
  /** Earliest run time; defaults to now. */
  runAt?: Date | number;
  maxAttempts?: number;
}

export interface JobRow {
  id: string;
  queue: string;
  dedupeKey: string | null;
  groupKey: string | null;
  payload: unknown;
  runAt: number;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lockedUntil: number | null;
  lastError: string | null;
}

interface RawJobRow {
  id: string;
  queue: string;
  dedupe_key: string | null;
  group_key: string | null;
  payload: string;
  run_at: number;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  locked_until: number | null;
  last_error: string | null;
}

/** Thrown by a handler to fail the job immediately, without further retries. */
export class PermanentJobError extends Error {}

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 60 * 60 * 1000;

export function backoffMs(attempts: number, random = Math.random) {
  const exponential = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exponential * (0.8 + random() * 0.4));
}

function toJob(row: RawJobRow): JobRow {
  return {
    id: row.id,
    queue: row.queue,
    dedupeKey: row.dedupe_key,
    groupKey: row.group_key,
    payload: JSON.parse(row.payload) as unknown,
    runAt: row.run_at,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lockedUntil: row.locked_until,
    lastError: row.last_error,
  };
}

/**
 * Durable job queue stored in the `jobs` table. All state changes are single SQL statements,
 * so they are atomic even with several async handlers running in the same process.
 */
@Injectable()
export class JobQueue {
  private readonly s;

  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle) {
    const { sqlite } = handle;
    this.s = {
      insert: sqlite.prepare(
        `insert into jobs (id, queue, dedupe_key, group_key, payload, run_at, max_attempts, created_at, updated_at)
         values (@id, @queue, @dedupeKey, @groupKey, @payload, @runAt, @maxAttempts, @now, @now)
         on conflict (dedupe_key) do nothing
         returning *`,
      ),
      byDedupe: sqlite.prepare(`select * from jobs where dedupe_key = ?`),
      byId: sqlite.prepare(`select * from jobs where id = ?`),
      // Claim the next due job whose group has nothing running. One statement = atomic claim.
      claim: sqlite.prepare(
        `update jobs
         set status = 'RUNNING', attempts = attempts + 1, locked_until = @lockedUntil, updated_at = @now
         where id = (
           select j.id from jobs j
           where j.status = 'QUEUED' and j.run_at <= @now
             and j.queue in (select value from json_each(@queues))
             and (j.group_key is null or not exists (
               select 1 from jobs r where r.group_key = j.group_key and r.status = 'RUNNING'))
           order by j.run_at, j.created_at
           limit 1)
         returning *`,
      ),
      complete: sqlite.prepare(
        `update jobs set status = 'DONE', locked_until = null, last_error = null, updated_at = @now
         where id = @id and status = 'RUNNING'`,
      ),
      retry: sqlite.prepare(
        `update jobs set status = 'QUEUED', locked_until = null, run_at = @runAt, last_error = @error, updated_at = @now
         where id = @id and status = 'RUNNING'`,
      ),
      fail: sqlite.prepare(
        `update jobs set status = 'FAILED', locked_until = null, last_error = @error, updated_at = @now
         where id = @id and status = 'RUNNING'`,
      ),
      cancel: sqlite.prepare(
        `update jobs set status = 'CANCELLED', updated_at = @now
         where status = 'QUEUED' and queue = @queue and group_key = @groupKey`,
      ),
      recoverAll: sqlite.prepare(
        `update jobs set status = 'QUEUED', locked_until = null, run_at = @now, updated_at = @now
         where status = 'RUNNING'`,
      ),
      expiredLocks: sqlite.prepare(
        `select * from jobs where status = 'RUNNING' and locked_until < @now`,
      ),
      counts: sqlite.prepare(`select status, count(*) as n from jobs group by status`),
      oldestQueued: sqlite.prepare(
        `select min(run_at) as t from jobs where status = 'QUEUED' and run_at <= @now`,
      ),
      prune: sqlite.prepare(
        `delete from jobs where (status in ('DONE', 'CANCELLED') and updated_at < @doneBefore)
                             or (status = 'FAILED' and updated_at < @failedBefore)`,
      ),
      // Push a still-queued job later. Completed jobs keep their dedupe keys, so this never reuses one.
      defer: sqlite.prepare(
        `update jobs set run_at = @runAt, updated_at = @now
         where id = (
           select id from jobs
           where queue = @queue and group_key = @groupKey and status = 'QUEUED'
           limit 1)
         returning *`,
      ),
    };
  }

  /**
   * One queued job per group. A second call before it runs only moves `run_at` later,
   * so a burst of messages becomes a single turn.
   */
  coalesce<T>(
    queue: string,
    groupKey: string,
    payload: T,
    opts: { delayMs: number; maxAttempts?: number },
  ): JobRow {
    const now = Date.now();
    const updated = this.s.defer.get({
      queue,
      groupKey,
      runAt: now + opts.delayMs,
      now,
    }) as RawJobRow | undefined;
    if (updated) return toJob(updated);
    return this.enqueue(queue, payload, {
      dedupeKey: `${queue}:${groupKey}:${newId()}`,
      groupKey,
      runAt: now + opts.delayMs,
      maxAttempts: opts.maxAttempts ?? 3,
    });
  }

  enqueue<T>(queue: string, payload: T, opts: EnqueueOptions = {}): JobRow {
    const now = Date.now();
    const runAt = opts.runAt instanceof Date ? opts.runAt.getTime() : (opts.runAt ?? now);
    const row = this.s.insert.get({
      id: newId(),
      queue,
      dedupeKey: opts.dedupeKey ?? null,
      groupKey: opts.groupKey ?? null,
      payload: JSON.stringify(payload ?? {}),
      runAt,
      maxAttempts: opts.maxAttempts ?? 5,
      now,
    }) as RawJobRow | undefined;
    if (row) return toJob(row);
    return toJob(this.s.byDedupe.get(opts.dedupeKey) as RawJobRow);
  }

  get(id: string): JobRow | null {
    const row = this.s.byId.get(id) as RawJobRow | undefined;
    return row ? toJob(row) : null;
  }

  /** Claims the next runnable job from one of `queues`, locking it for `lockMs`. */
  claim(queues: string[], lockMs: number, now = Date.now()): JobRow | null {
    if (queues.length === 0) return null;
    const row = this.s.claim.get({
      queues: JSON.stringify(queues),
      lockedUntil: now + lockMs,
      now,
    }) as RawJobRow | undefined;
    return row ? toJob(row) : null;
  }

  complete(id: string) {
    this.s.complete.run({ id, now: Date.now() });
  }

  /** Records a failed attempt: schedules a retry with backoff, or fails the job for good. */
  fail(job: JobRow, error: unknown, now = Date.now()): 'RETRY' | 'FAILED' {
    const message = error instanceof Error ? error.message : String(error);
    const permanent = error instanceof PermanentJobError;
    if (!permanent && job.attempts < job.maxAttempts) {
      this.s.retry.run({ id: job.id, runAt: now + backoffMs(job.attempts), error: message, now });
      return 'RETRY';
    }
    this.s.fail.run({ id: job.id, error: message, now });
    return 'FAILED';
  }

  /** Cancels queued (not running) jobs, e.g. pending AI replies after a takeover (BUILD_PLAN D8). */
  cancel(queue: string, groupKey: string): number {
    return this.s.cancel.run({ queue, groupKey, now: Date.now() }).changes;
  }

  /**
   * Called on startup. The API is the only worker process, so any job still marked RUNNING was
   * interrupted by a crash or restart and is safe to run again.
   */
  recoverInterrupted(): number {
    return this.s.recoverAll.run({ now: Date.now() }).changes;
  }

  /** Jobs whose handler exceeded its lock; each counts as a failed attempt. */
  failExpiredLocks(now = Date.now()): number {
    const rows = this.s.expiredLocks.all({ now }) as RawJobRow[];
    for (const row of rows) this.fail(toJob(row), new Error('Job timed out'), now);
    return rows.length;
  }

  stats(now = Date.now()) {
    const counts: Record<JobStatus, number> = {
      QUEUED: 0,
      RUNNING: 0,
      DONE: 0,
      FAILED: 0,
      CANCELLED: 0,
    };
    for (const r of this.s.counts.all() as Array<{ status: JobStatus; n: number }>)
      counts[r.status] = r.n;
    const oldest = (this.s.oldestQueued.get({ now }) as { t: number | null }).t;
    return {
      counts,
      oldestQueuedSeconds: oldest === null ? null : Math.round((now - oldest) / 1000),
    };
  }

  prune(now = Date.now()) {
    const day = 24 * 60 * 60 * 1000;
    return this.s.prune.run({ doneBefore: now - 7 * day, failedBefore: now - 30 * day, now })
      .changes;
  }
}
