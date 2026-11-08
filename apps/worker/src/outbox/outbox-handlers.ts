import type { OutboxEventRecord, OutboxHandlers, PrismaClient } from '@medtravel/db';
import { captureError, runWithRequestId } from '@medtravel/observability';
import type { Providers } from '@medtravel/notifications';
import type { RealtimePublisher } from '@medtravel/realtime';
import type { ClamdOptions, ObjectStore } from '@medtravel/storage';
import { processUploadedDocument } from '../documents/process-document.js';
import { deliverQueuedNotification } from './handlers/notification-deliver.handler.js';
import { publishRealtime } from './handlers/realtime-publish.handler.js';
import { notifyAgentOfStageChange } from './handlers/case-stage-changed.handler.js';
import { notifyAdminsOfIncident } from './handlers/incident-created.handler.js';
import { revalidateWebsite, type RevalidateTarget } from './handlers/web-revalidate.handler.js';

export interface HandlerDeps {
  prisma: PrismaClient;
  store: ObjectStore;
  clamd: ClamdOptions;
  providers: Providers;
  publisher: Pick<RealtimePublisher, 'publish'>;
  revalidate: RevalidateTarget;
}

/**
 * Which handler runs for which event type. Later tasks add theirs here (notifications, SLA timers, search refresh). Every
 * handler must be idempotent: an event can be delivered more than once.
 */
export function outboxHandlers(deps: HandlerDeps): OutboxHandlers {
  return observed({
    'incident.created': async (event) => void (await notifyAdminsOfIncident(deps.prisma, event)),
    'document.uploaded': (event) => processUploadedDocument(deps, event),
    'notification.deliver': (event) => deliverQueuedNotification(deps, event),
    'realtime.publish': (event) => publishRealtime(deps, event),
    'web.revalidate': async (event) => void (await revalidateWebsite(deps.revalidate, event)),
    'case.stage_changed': async (event) =>
      void (await notifyAgentOfStageChange(deps.prisma, event)),
  });
}

/** The request ID an event was queued under, if the API recorded one. */
export const requestIdOf = (event: OutboxEventRecord): string | undefined => {
  const value = (event.payload as { requestId?: unknown } | null)?.requestId;
  return typeof value === 'string' ? value : undefined;
};

/**
 * Runs each handler under the request ID of the request that queued the event, so its log lines carry it, and reports a failure to
 * Sentry with the event type and that ID. The failure is still thrown: the outbox retries it.
 */
export function observed(handlers: OutboxHandlers): OutboxHandlers {
  return Object.fromEntries(
    Object.entries(handlers).map(([type, handler]) => [
      type,
      (event: OutboxEventRecord) =>
        runWithRequestId(requestIdOf(event) ?? event.id, async () => {
          try {
            return await handler(event);
          } catch (error) {
            captureError(error, { requestId: requestIdOf(event) ?? event.id, jobType: type });
            throw error;
          }
        }),
    ]),
  );
}
