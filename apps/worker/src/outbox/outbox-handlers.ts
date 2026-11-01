import type { OutboxHandlers, PrismaClient } from '@medtravel/db';
import type { Providers } from '@medtravel/notifications';
import type { RealtimePublisher } from '@medtravel/realtime';
import type { ClamdOptions, ObjectStore } from '@medtravel/storage';
import { processUploadedDocument } from '../documents/process-document.js';
import { deliverQueuedNotification } from './handlers/notification-deliver.handler.js';
import { publishRealtime } from './handlers/realtime-publish.handler.js';
import { notifyAgentOfStageChange } from './handlers/case-stage-changed.handler.js';
import { notifyAdminsOfIncident } from './handlers/incident-created.handler.js';

export interface HandlerDeps {
  prisma: PrismaClient;
  store: ObjectStore;
  clamd: ClamdOptions;
  providers: Providers;
  publisher: Pick<RealtimePublisher, 'publish'>;
}

/**
 * Which handler runs for which event type. Later tasks add theirs here (notifications, SLA timers, search refresh). Every
 * handler must be idempotent: an event can be delivered more than once.
 */
export function outboxHandlers(deps: HandlerDeps): OutboxHandlers {
  return {
    'incident.created': async (event) => void (await notifyAdminsOfIncident(deps.prisma, event)),
    'document.uploaded': (event) => processUploadedDocument(deps, event),
    'notification.deliver': (event) => deliverQueuedNotification(deps, event),
    'realtime.publish': (event) => publishRealtime(deps, event),
    'case.stage_changed': async (event) =>
      void (await notifyAgentOfStageChange(deps.prisma, event)),
  };
}
