import type { OutboxEventRecord, PrismaClient } from '@medtravel/db';
import { deliverNotification, type Providers } from '@medtravel/notifications';
import { z } from 'zod';

const payloadSchema = z.object({ notificationId: z.uuid() });

/**
 * `notification.deliver`: send one queued message through its channel's provider. A provider failure throws, so the outbox
 * retries with backoff; the notification row counts the attempts and is marked failed after the last one. Delivering an
 * already delivered message does nothing.
 */
export async function deliverQueuedNotification(
  deps: { prisma: PrismaClient; providers: Providers },
  event: OutboxEventRecord,
): Promise<void> {
  const { notificationId } = payloadSchema.parse(event.payload);
  await deliverNotification(deps, notificationId);
}
