import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backoffMs, JobQueue, PermanentJobError } from '../src/jobs/job-queue.js';
import { startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let queue: JobQueue;
beforeEach(async () => {
  t = await startTestApp();
  queue = t.app.get(JobQueue);
});
afterEach(async () => {
  await t.close();
});

describe('JobQueue', () => {
  it('runs a job once and marks it done', async () => {
    const seen: unknown[] = [];
    t.worker.register('test.echo', (p) => void seen.push(p));
    const job = queue.enqueue('test.echo', { hello: 'world' });
    await t.worker.drain();
    expect(seen).toEqual([{ hello: 'world' }]);
    expect(queue.get(job.id)?.status).toBe('DONE');
  });

  it('dedupes by key', async () => {
    let runs = 0;
    t.worker.register('test.dedupe', () => void runs++);
    const a = queue.enqueue('test.dedupe', {}, { dedupeKey: 'event-1' });
    const b = queue.enqueue('test.dedupe', {}, { dedupeKey: 'event-1' });
    expect(b.id).toBe(a.id);
    await t.worker.drain();
    queue.enqueue('test.dedupe', {}, { dedupeKey: 'event-1' });
    await t.worker.drain();
    expect(runs).toBe(1);
  });

  it('retries with exponential backoff, then fails', async () => {
    let attempts = 0;
    t.worker.register('test.flaky', () => {
      attempts++;
      throw new Error('boom');
    });
    const job = queue.enqueue('test.flaky', {}, { maxAttempts: 3 });

    await t.worker.drain();
    let row = queue.get(job.id)!;
    expect(row).toMatchObject({ status: 'QUEUED', attempts: 1, lastError: 'boom' });
    expect(row.runAt).toBeGreaterThan(Date.now());

    // Fast-forward past each backoff.
    await t.worker.drain(row.runAt + 1);
    row = queue.get(job.id)!;
    expect(row.attempts).toBe(2);
    await t.worker.drain(row.runAt + 1);
    expect(queue.get(job.id)).toMatchObject({ status: 'FAILED', attempts: 3 });
    expect(attempts).toBe(3);
  });

  it('fails immediately on PermanentJobError', async () => {
    t.worker.register('test.permanent', () => {
      throw new PermanentJobError('bad payload');
    });
    const job = queue.enqueue('test.permanent', {});
    await t.worker.drain();
    expect(queue.get(job.id)).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      lastError: 'bad payload',
    });
  });

  it('never runs two jobs of the same group at once', async () => {
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];
    t.worker.register<{ n: number }>(
      'test.group',
      async ({ n }) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 10));
        order.push(n);
        active--;
      },
      { concurrency: 4 },
    );
    for (let n = 0; n < 4; n++) queue.enqueue('test.group', { n }, { groupKey: 'conversation-1' });
    queue.enqueue('test.group', { n: 99 }, { groupKey: 'conversation-2' });
    await t.worker.drain();
    expect(order.filter((n) => n !== 99)).toEqual([0, 1, 2, 3]);
    expect(maxActive).toBe(2); // one per group
  });

  it('cancels queued jobs for a group', async () => {
    let runs = 0;
    t.worker.register('test.cancel', () => void runs++);
    queue.enqueue('test.cancel', {}, { groupKey: 'g' });
    queue.enqueue('test.cancel', {}, { groupKey: 'g' });
    expect(queue.cancel('test.cancel', 'g')).toBe(2);
    await t.worker.drain();
    expect(runs).toBe(0);
  });

  it('re-queues jobs interrupted by a crash', () => {
    const job = queue.enqueue('test.crash', {});
    expect(queue.claim(['test.crash'], 60_000)?.id).toBe(job.id);
    expect(queue.get(job.id)?.status).toBe('RUNNING');
    expect(queue.recoverInterrupted()).toBe(1);
    expect(queue.get(job.id)?.status).toBe('QUEUED');
  });

  it('times out jobs whose lock expired', () => {
    const job = queue.enqueue('test.timeout', {}, { maxAttempts: 1 });
    queue.claim(['test.timeout'], 1_000);
    expect(queue.failExpiredLocks(Date.now() + 2_000)).toBe(1);
    expect(queue.get(job.id)).toMatchObject({ status: 'FAILED', lastError: 'Job timed out' });
  });

  it('enqueues scheduled jobs once per slot', async () => {
    let runs = 0;
    t.worker.register('test.scheduled', () => void runs++);
    t.worker.schedule('test.scheduled', 60_000, 'test.scheduled');
    const now = Math.floor(Date.now() / 60_000) * 60_000 + 1_000;
    await t.worker.drain(now);
    await t.worker.drain(now + 10_000);
    expect(runs).toBe(1);
    await t.worker.drain(now + 60_000);
    expect(runs).toBe(2);
  });

  it('reports stats', () => {
    queue.enqueue('test.stats', {});
    expect(queue.stats().counts.QUEUED).toBe(1);
  });
});

describe('backoffMs', () => {
  it('grows exponentially and is capped', () => {
    const mid = () => 0.5;
    expect(backoffMs(1, mid)).toBe(5_000);
    expect(backoffMs(2, mid)).toBe(10_000);
    expect(backoffMs(4, mid)).toBe(40_000);
    expect(backoffMs(30, mid)).toBe(60 * 60 * 1000);
  });
});
