import type { OutboxEventRecord } from '@medtravel/db';
import { realtimeOutboxPayloadSchema, type RealtimePublisher } from '@medtravel/realtime';
import { realtimePayloadSchemas } from '@medtravel/contracts';

/**
 * `realtime.publish`: push an event to a room after the change that queued it has committed. A failure to reach Redis throws,
 * so the outbox retries; the payload is validated again (ids only) before it leaves.
 */
export async function publishRealtime(
  deps: { publisher: Pick<RealtimePublisher, 'publish'> },
  event: OutboxEventRecord,
): Promise<void> {
  const { room, event: name, payload } = realtimeOutboxPayloadSchema.parse(event.payload);
  const checked = realtimePayloadSchemas[name].parse(payload);
  // The outbox event id names the push: a retry after a partial failure logs and sends the same event, not a second one.
  await deps.publisher.publish(room, name, checked as never, { id: event.id });
}
