import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DOWNLOAD_ALERT_LIMIT, DOWNLOAD_ALERT_WINDOW_MINUTES } from '@medtravel/contracts';
import type { RequestContext } from '../common/request-context.js';
import type { Db } from '../database/database.module.js';

/**
 * One user downloading more than `DOWNLOAD_ALERT_LIMIT` documents inside the window opens an incident and writes an
 * `incident.created` event, which the worker turns into a notification for every admin. Called inside the transaction that
 * records the download, so the count includes it. A per-user advisory lock serialises the counting, and at most one
 * incident is raised per user per window.
 */
@Injectable()
export class DownloadAlertService {
  async check(
    db: Db,
    userId: string,
    context: RequestContext,
    now: Date = new Date(),
  ): Promise<boolean> {
    // One user's downloads are counted one at a time, so two at once cannot both miss the limit or both raise the alert.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const since = new Date(now.getTime() - DOWNLOAD_ALERT_WINDOW_MINUTES * 60_000);
    const count = await db.auditEvent.count({
      where: { actorId: userId, action: 'document.downloaded', createdAt: { gte: since } },
    });
    if (count <= DOWNLOAD_ALERT_LIMIT) return false;

    // One alert per user per window: while the last one is still inside it, carry on quietly.
    const recent = await db.outboxEvent.findFirst({
      where: {
        type: 'incident.created',
        dedupeKey: { startsWith: `download-alert:${userId}:` },
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) return false;

    const incidentId = randomUUID();
    await db.outboxEvent.create({
      data: {
        type: 'incident.created',
        aggregateType: 'Incident',
        aggregateId: incidentId,
        dedupeKey: `download-alert:${userId}:${incidentId}`,
        payload: {
          incidentId,
          reason: 'many_downloads',
          userId,
          count,
          windowMinutes: DOWNLOAD_ALERT_WINDOW_MINUTES,
        },
      },
    });
    await db.incident.create({
      data: {
        id: incidentId,
        type: 'other',
        severity: 'high',
        description: `User ${userId} downloaded ${count} documents in the last ${DOWNLOAD_ALERT_WINDOW_MINUTES} minutes (limit ${DOWNLOAD_ALERT_LIMIT}). Check the audit log for this user.`,
      },
    });
    await db.auditEvent.create({
      data: {
        actorId: null,
        action: 'incident.created',
        entityType: 'Incident',
        entityId: incidentId,
        after: { reason: 'many_downloads', userId, count },
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
      },
    });
    return true;
  }
}
