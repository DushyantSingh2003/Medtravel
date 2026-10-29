import type { OutboxEventRecord, PrismaClient } from '@medtravel/db';
import { z } from 'zod';

const payloadSchema = z.object({ incidentId: z.uuid() });

/**
 * An incident was opened (for example by the download alert): tell every active super admin in their notifications.
 * Idempotent: each notification carries the key `<event id>:<user id>`, which is unique, so a redelivered event (even two
 * deliveries at once) does not notify anyone twice.
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
  // Titles are English here; the notification engine (F-07) renders them in each person's language from the template key.
  // `dedupeKey` is unique: a second delivery of this event, even at the same moment, inserts nothing.
  const created = await prisma.notification.createMany({
    skipDuplicates: true,
    data: admins.map((admin) => ({
      dedupeKey: `${event.id}:${admin.id}`,
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
  return created.count;
}
