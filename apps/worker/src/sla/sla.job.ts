import type { PrismaClient } from '@medtravel/db';
import { enqueueNotification } from '@medtravel/notifications';
import { stageLabel } from '../outbox/handlers/stage-label.js';

export const SLA_QUEUE = 'sla';
export const SLA_SCHEDULER_ID = 'sla-sweep';
/** The sweep runs every minute; a stage that runs late is noticed within about a minute. */
export const SLA_SWEEP_EVERY_MS = 60_000;
/** Most cases handled in one run; the rest wait for the next minute. */
const BATCH = 200;

/** "2 h 15 min" for a duration in milliseconds. */
export function overdueText(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days} d ${hours} h`;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
}

/**
 * Finds the cases whose stage timer has run out and tells their owner (or, with no owner, the super admins) once. The case is
 * marked first in the same transaction, so two workers sweeping together cannot both announce it. Entering another stage clears
 * the mark and starts a new timer.
 */
export async function sweepOverdueCases(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ breached: number }> {
  const due = await prisma.case.findMany({
    where: {
      slaDueAt: { lt: now },
      slaBreachedAt: null,
      closedAt: null,
      deletedAt: null,
      stage: { notIn: ['on_hold', 'lost', 'cancelled'] },
    },
    orderBy: { slaDueAt: 'asc' },
    take: BATCH,
    select: { id: true, caseNo: true, stage: true, ownerId: true, slaDueAt: true },
  });
  let breached = 0;
  for (const row of due) {
    if (!row.slaDueAt) continue;
    const overdueMs = now.getTime() - row.slaDueAt.getTime();
    const announced = await announce(prisma, row, overdueMs, now);
    if (announced) breached += 1;
  }
  return { breached };
}

async function announce(
  prisma: PrismaClient,
  row: { id: string; caseNo: string; stage: string; ownerId: string | null; slaDueAt: Date | null },
  overdueMs: number,
  now: Date,
): Promise<boolean> {
  // One case that cannot be announced must not stop the others; it is retried on the next sweep because its mark rolls back.
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.case.updateMany({
        where: { id: row.id, slaBreachedAt: null, slaDueAt: row.slaDueAt },
        data: { slaBreachedAt: now },
      });
      if (claimed.count !== 1) return false;
      const recipients = row.ownerId
        ? [row.ownerId]
        : (
            await tx.user.findMany({
              where: { role: 'super_admin', status: 'active', deletedAt: null },
              select: { id: true },
            })
          ).map((user) => user.id);
      await enqueueNotification(tx, {
        eventKey: 'sla_breach',
        recipients,
        data: {
          caseNumber: row.caseNo,
          slaName: stageLabel(row.stage),
          overdueBy: overdueText(overdueMs),
        },
        dedupeKey: `sla:${row.id}:${row.slaDueAt?.toISOString()}`,
        caseId: row.id,
      });
      return true;
    });
  } catch (error) {
    // Only the case id is logged: nothing about the patient.
    console.warn(
      `sla: could not announce case ${row.id}: ${error instanceof Error ? error.name : 'error'}`,
    );
    return false;
  }
}
