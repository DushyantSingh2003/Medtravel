import { Injectable } from '@nestjs/common';
import type { Prisma } from '@medtravel/db';
import type { RequestContext } from '../common/request-context.js';
import type { Db } from '../database/database.module.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  patientId?: string | null;
}

/**
 * Writes an `AuditEvent`. Always called with the transaction client of the change it describes, so the audit row
 * exists if and only if the change does. F-05 adds masking of sensitive fields and the view/download events.
 */
@Injectable()
export class AuditService {
  async record(db: Db, context: RequestContext, entry: AuditEntry): Promise<void> {
    await db.auditEvent.create({
      data: {
        actorId: context.actor?.userId ?? null,
        actorRole: context.actor?.role ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ...(entry.patientId ? { patientId: entry.patientId } : {}),
        ...(entry.before == null ? {} : { before: entry.before }),
        ...(entry.after == null ? {} : { after: entry.after }),
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
      },
    });
  }
}
