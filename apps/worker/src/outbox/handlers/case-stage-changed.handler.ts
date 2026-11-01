import type { OutboxEventRecord, PrismaClient } from '@medtravel/db';
import { enqueueNotification } from '@medtravel/notifications';
import { z } from 'zod';
import { stageLabel } from './stage-label.js';

const payloadSchema = z.object({
  caseId: z.uuid(),
  to: z.string(),
  status: z.string(),
});

/** "Asha Verma" → "A.V." — agents see initials, never the name (PRD section 8). */
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join('');

/**
 * A case changed stage: tell the referring agency's people, but only if the patient agreed to share the stage with that
 * agency and has not withdrawn it. Idempotent: the message key is the event id, so a redelivery notifies no one twice.
 */
export async function notifyAgentOfStageChange(
  prisma: PrismaClient,
  event: OutboxEventRecord,
): Promise<number> {
  const { caseId, to, status } = payloadSchema.parse(event.payload);
  // Closing a finished follow-up keeps the stage; the agency was already told it is in follow-up.
  if (status === 'closed') return 0;
  const found = await prisma.case.findFirst({
    where: { id: caseId, deletedAt: null, agentId: { not: null } },
    select: {
      caseNo: true,
      agentId: true,
      patient: { select: { fullName: true } },
    },
  });
  if (!found?.agentId) return 0;
  const consent = await prisma.consent.findFirst({
    where: {
      caseId,
      agentId: found.agentId,
      type: 'share_stage_with_agent',
      withdrawnAt: null,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!consent) return 0;
  const people = await prisma.agentUser.findMany({
    where: { agentId: found.agentId, deletedAt: null },
    select: { userId: true },
  });
  const result = await prisma.$transaction((tx) =>
    enqueueNotification(tx, {
      eventKey: 'referral_stage_changed',
      recipients: people.map((person) => person.userId),
      data: {
        patientInitials: initials(found.patient.fullName),
        caseNumber: found.caseNo,
        stage: stageLabel(to),
      },
      dedupeKey: event.id,
      caseId,
    }),
  );
  return result.queued.length;
}
