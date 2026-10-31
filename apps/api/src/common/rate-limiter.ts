import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle } from '@snapsell/db';
import { DATABASE } from '../database/database.module.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter stored in SQLite so limits survive restarts (BUILD_PLAN Phase 1).
 * The upsert is a single statement, so concurrent hits cannot lose counts.
 */
@Injectable()
export class RateLimiter {
  private readonly hitStmt;
  private readonly peekStmt;
  private readonly resetStmt;
  private readonly pruneStmt;

  constructor(@Inject(DATABASE) { sqlite }: DatabaseHandle) {
    this.hitStmt = sqlite.prepare<[string, number], { count: number }>(
      `insert into rate_limits (key, window_start, count) values (?, ?, 1)
       on conflict (key, window_start) do update set count = count + 1
       returning count`,
    );
    this.peekStmt = sqlite.prepare<[string, number], { count: number }>(
      `select count from rate_limits where key = ? and window_start = ?`,
    );
    this.resetStmt = sqlite.prepare<[string]>(`delete from rate_limits where key = ?`);
    this.pruneStmt = sqlite.prepare<[number]>(`delete from rate_limits where window_start < ?`);
  }

  hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const windowStart = now - (now % windowMs);
    const { count } = this.hitStmt.get(key, windowStart)!;
    return this.result(count, limit, windowStart + windowMs - now, true);
  }

  /** Check without counting a hit. */
  peek(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const windowStart = now - (now % windowMs);
    const count = this.peekStmt.get(key, windowStart)?.count ?? 0;
    return this.result(count, limit, windowStart + windowMs - now, false);
  }

  reset(key: string) {
    this.resetStmt.run(key);
  }

  prune(olderThanMs: number, now = Date.now()) {
    return this.pruneStmt.run(now - olderThanMs).changes;
  }

  private result(count: number, limit: number, msLeft: number, counted: boolean): RateLimitResult {
    const allowed = counted ? count <= limit : count < limit;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: allowed ? 0 : Math.ceil(msLeft / 1000),
    };
  }
}
