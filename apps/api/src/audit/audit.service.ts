import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@medtravel/db';
import { diffAudit, maskSensitive, type AuditAccessAction } from '@medtravel/contracts';
import type { RequestContext } from '../common/request-context.js';
import { PRISMA, type Db } from '../database/database.module.js';
import { DownloadAlertService } from './download-alert.service.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  patientId?: string | null;
}

export interface AccessEntry {
  action: AuditAccessAction;
  entityType: string;
  entityId: string;
  /** The patient the record belongs to, so a patient's whole history can be pulled up. */
  patientId?: string | null;
}

/**
 * Writes `AuditEvent` rows. `record` is called with the transaction client of the change it describes, so the audit row
 * exists if and only if the change does. An update stores only the fields that changed, and every stored value goes
 * through `maskSensitive`, so secrets never reach the log and passport numbers are cut to their last four characters.
 */
@Injectable()
export class AuditService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly downloads: DownloadAlertService,
  ) {}

  async record(db: Db, context: RequestContext, entry: AuditEntry): Promise<void> {
    const { before, after } = diffAudit(entry.before, entry.after);
    await db.auditEvent.create({
      data: {
        actorId: context.actor?.userId ?? null,
        actorRole: context.actor?.role ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ...(entry.patientId ? { patientId: entry.patientId } : {}),
        ...(before ? { before: maskSensitive(before) as Prisma.InputJsonObject } : {}),
        ...(after ? { after: maskSensitive(after) as Prisma.InputJsonObject } : {}),
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
      },
    });
  }

  /** Records an event that has no change of its own to travel with, such as an export. */
  recordNow(context: RequestContext, entry: AuditEntry): Promise<void> {
    return this.record(this.prisma, context, entry);
  }

  /**
   * Records that someone viewed or downloaded a patient record or a document. Call it on every such read, before the
   * response goes out: the row is committed when this returns, so the audit screen shows it at once. A download also
   * counts towards the hourly limit that opens an incident.
   */
  async recordAccess(context: RequestContext, entry: AccessEntry): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.record(tx, context, entry);
      if (entry.action === 'document.downloaded' && context.actor) {
        await this.downloads.check(tx, context.actor.userId, context);
      }
    });
  }
}
