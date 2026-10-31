import { Inject, Injectable } from '@nestjs/common';
import { auditLogs, type DatabaseHandle, newId } from '@snapsell/db';
import { DATABASE } from '../database/database.module.js';

export interface AuditEntry {
  actor: 'OWNER' | 'SYSTEM' | 'AI';
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle) {}

  record(entry: AuditEntry) {
    this.handle.db
      .insert(auditLogs)
      .values({
        id: newId(),
        ...entry,
        actorId: entry.actorId ?? null,
        entityId: entry.entityId ?? null,
      })
      .run();
  }
}
