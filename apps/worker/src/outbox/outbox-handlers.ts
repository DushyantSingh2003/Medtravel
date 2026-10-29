import type { OutboxHandlers, PrismaClient } from '@medtravel/db';
import { notifyAdminsOfIncident } from './handlers/incident-created.handler.js';

/**
 * Which handler runs for which event type. Later tasks add theirs here (notifications, SLA timers, search refresh). Every
 * handler must be idempotent: an event can be delivered more than once.
 */
export function outboxHandlers(prisma: PrismaClient): OutboxHandlers {
  return {
    'incident.created': async (event) => void (await notifyAdminsOfIncident(prisma, event)),
  };
}
