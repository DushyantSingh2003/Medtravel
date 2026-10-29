import type { OutboxEventRecord, PrismaClient } from '@medtravel/db';
import { enqueueNotification } from '@medtravel/notifications';
import { z } from 'zod';

const payloadSchema = z.object({ incidentId: z.uuid() });

/**
 * An incident was opened (for example by the download alert): tell every active super admin through the notification engine.
 * Idempotent: every message carries the key `<event id>:<user id>:<channel>`, which is unique, so a redelivered event (even
 * two deliveries at once) does not notify anyone twice.
 */
export async function notifyAdminsOfIncident(
  prisma: PrismaClient,
  event: OutboxEventRecord,
): Promise<number> {
  const { incidentId } = payloadSchema.parse(event.payload);
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    select: { id: true, type: true, severity: true, caseId: true, deletedAt: true },
  });
  // Deleted or never committed: nothing to tell anyone.
  if (!incident || incident.deletedAt) return 0;

  const admins = await prisma.user.findMany({
    where: { role: 'super_admin', status: 'active', deletedAt: null },
    select: { id: true },
  });
  // Each admin is told in their own language, on the channels they use; `event.id` makes a redelivery a no-op.
  const result = await prisma.$transaction((tx) =>
    enqueueNotification(tx, {
      eventKey: 'incident_logged',
      recipients: admins.map((admin) => admin.id),
      data: { severity: incident.severity },
      dedupeKey: event.id,
      ...(incident.caseId ? { caseId: incident.caseId } : {}),
    }),
  );
  return result.queued.length;
}
