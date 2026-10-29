import {
  realtimePayloadSchemas,
  type RealtimeEventName,
  type RealtimePayload,
} from '@medtravel/contracts';
import type { Prisma } from '@medtravel/db';
import { z } from 'zod';

/** The outbox event type the worker turns into a push. */
export const REALTIME_OUTBOX_TYPE = 'realtime.publish';

export const realtimeOutboxPayloadSchema = z.object({
  room: z.string().min(3).max(80),
  event: z.enum([
    'notification.created',
    'case.updated',
    'message.created',
    'task.assigned',
    'typing',
  ]),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * Queues a push inside the transaction of the change it reports. The worker delivers it after the commit, so nobody is
 * told about a change that rolled back. `dedupeKey` makes a repeated queueing a no-op.
 */
export async function enqueueRealtime<E extends RealtimeEventName>(
  db: Prisma.TransactionClient,
  input: { room: string; event: E; payload: RealtimePayload<E>; dedupeKey?: string },
): Promise<void> {
  const payload = realtimePayloadSchemas[input.event].parse(input.payload) as Record<
    string,
    string | boolean | string[]
  >;
  await db.outboxEvent.createMany({
    skipDuplicates: true,
    data: [
      {
        type: REALTIME_OUTBOX_TYPE,
        aggregateType: 'Realtime',
        aggregateId: input.room,
        payload: { room: input.room, event: input.event, payload },
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      },
    ],
  });
}
