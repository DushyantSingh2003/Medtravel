import type { OutboxEventRecord, PrismaClient } from '@medtravel/db';
import { z } from 'zod';

const payloadSchema = z.object({ incidentId: z.uuid() });

/**
 * An incident was opened (for example by the download alert): tell every active super admin in their notifications.
 * Idempotent: the event id is stored on each notification, so a retried event does not notify anyone twice.
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
  const already = await prisma.notification.findMany({
    where: {
      templateKey: 'incident.created',
      userId: { in: admins.map((admin) => admin.id) },
      data: { path: ['eventId'], equals: event.id },
    },
    select: { userId: true },
  });
  const notified = new Set(already.map((row) => row.userId));
  const fresh = admins.filter((admin) => !notified.has(admin.id));
  if (fresh.length === 0) return 0;

  // Titles are English here; the notification engine (F-07) renders them in each person's language from the template key.
  await prisma.notification.createMany({
    data: fresh.map((admin) => ({
      userId: admin.id,
      channel: 'in_app' as const,
      status: 'sent' as const,
      sentAt: new Date(),
      templateKey: 'incident.created',
      title: `New ${incident.severity} incident`,
      body: 'A new incident needs attention. Open the incidents list or the audit log for details.',
      data: { eventId: event.id, incidentId: incident.id },
      ...(incident.caseId ? { caseId: incident.caseId } : {}),
    })),
  });
  return fresh.length;
}
