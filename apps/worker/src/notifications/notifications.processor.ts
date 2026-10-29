import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE, notificationJobSchema } from './notifications.queue.js';

/**
 * Example processor that proves the BullMQ wiring end to end.
 *
 * Notifications are not delivered here: the notification engine (F-07) queues each message as an outbox
 * event and `outbox/handlers/notification-deliver.handler.ts` sends it. This stays as the minimal example
 * of a BullMQ job for work that is not a domain event.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  async process(job: Job<unknown>): Promise<{ delivered: boolean }> {
    const payload = notificationJobSchema.parse(job.data);

    // `to` is an email address or phone number — never log it in full.
    this.logger.log(
      `notification job ${job.id}: ${payload.channel}/${payload.template} (${payload.locale})`,
    );

    return { delivered: true };
  }
}
