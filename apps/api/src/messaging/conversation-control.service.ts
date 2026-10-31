import { HttpStatus, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { aiSettings, conversationControls, type DatabaseHandle, type DbLike } from '@snapsell/db';
import type { ConversationMode } from '@snapsell/shared';
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { ApiError } from '../common/errors.js';
import { EventBus } from '../common/events.js';
import { DATABASE } from '../database/database.module.js';
import { JobQueue } from '../jobs/job-queue.js';
import { JobWorker } from '../jobs/job-worker.js';

export type ControlActor = { type: 'OWNER'; id: string } | { type: 'SYSTEM' };

export const AI_RESPOND_QUEUE = 'ai.respond';

/** Ensures a conversation has a control row. `mode` applies only when the row is created. */
export function ensureControl(
  db: DbLike,
  conversationId: string,
  mode?: ConversationMode,
) {
  db.insert(conversationControls)
    .values(mode ? { conversationId, mode } : { conversationId })
    .onConflictDoNothing()
    .run();
}

/**
 * Who answers a conversation: the assistant (auto / suggest), the owner, or nobody (paused).
 * Every change bumps `generation` so AI work that started earlier is dropped (BUILD_PLAN D8),
 * and cancels AI replies that haven't started yet.
 */
@Injectable()
export class ConversationControlService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly queue: JobQueue,
    private readonly worker: JobWorker,
    private readonly audit: AuditService,
    private readonly events: EventBus,
  ) {}

  onModuleInit() {
    this.worker.register('conversations.release', () => {
      this.releaseExpired();
    });
    this.worker.schedule('conversations.release', 60_000, 'conversations.release');
  }

  get(conversationId: string) {
    ensureControl(this.handle.db, conversationId);
    return this.handle.db
      .select()
      .from(conversationControls)
      .where(eq(conversationControls.conversationId, conversationId))
      .get()!;
  }

  setMode(
    conversationId: string,
    mode: ConversationMode,
    actor: ControlActor,
    opts: { until?: Date | null; action?: string } = {},
  ) {
    const { db } = this.handle;
    const until = mode === 'HUMAN' ? (opts.until ?? null) : null;
    if (until && until.getTime() <= Date.now()) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Pick a time in the future.',
        {
          until: 'Pick a time in the future.',
        },
      );
    }
    const result = db.transaction((tx) => {
      ensureControl(tx, conversationId);
      const before = tx
        .select()
        .from(conversationControls)
        .where(eq(conversationControls.conversationId, conversationId))
        .get()!;
      const after = tx
        .update(conversationControls)
        .set({
          mode,
          takeoverUntil: until,
          generation: sql`${conversationControls.generation} + 1`,
          changedBy: actor.type === 'OWNER' ? actor.id : 'SYSTEM',
          changedAt: new Date(),
        })
        .where(eq(conversationControls.conversationId, conversationId))
        .returning()
        .get()!;
      const cancelled = this.queue.cancel(AI_RESPOND_QUEUE, conversationId);
      return { before, after, cancelled };
    });
    this.audit.record({
      actor: actor.type,
      actorId: actor.type === 'OWNER' ? actor.id : null,
      action: opts.action ?? 'conversation.mode',
      entity: 'conversation',
      entityId: conversationId,
      before: { mode: result.before.mode, takeoverUntil: result.before.takeoverUntil },
      after: {
        mode: result.after.mode,
        takeoverUntil: result.after.takeoverUntil,
        cancelledAiJobs: result.cancelled,
      },
    });
    this.events.emit('conversation.updated', { conversationId });
    return result.after;
  }

  /** The owner answers; `until` null means until they release it (never auto-released). */
  takeover(conversationId: string, until: Date | null, actor: ControlActor) {
    return this.setMode(conversationId, 'HUMAN', actor, { until, action: 'conversation.takeover' });
  }

  release(conversationId: string, actor: ControlActor) {
    return this.setMode(conversationId, this.defaultMode(), actor, {
      action: 'conversation.release',
    });
  }

  /** Hands timed takeovers back to the assistant. Indefinite ones (no end time) are left alone. */
  releaseExpired(now = Date.now()) {
    const due = this.handle.db
      .select({ id: conversationControls.conversationId })
      .from(conversationControls)
      .where(
        and(
          eq(conversationControls.mode, 'HUMAN'),
          isNotNull(conversationControls.takeoverUntil),
          lte(conversationControls.takeoverUntil, new Date(now)),
        ),
      )
      .all();
    for (const { id } of due) this.release(id, { type: 'SYSTEM' });
    return due.length;
  }

  /** Mode a conversation returns to after a takeover, following the global AI setting. */
  defaultMode(): ConversationMode {
    const s = this.handle.db.select({ mode: aiSettings.mode }).from(aiSettings).get();
    return s?.mode === 'AUTO' ? 'AI_AUTO' : 'AI_SUGGEST';
  }
}
