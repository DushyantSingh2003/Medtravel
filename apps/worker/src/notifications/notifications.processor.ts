import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE, notificationJobSchema } from './notifications.queue.js';

/**
 * Example processor that proves the BullMQ wiring end to end.
 *
 * Real delivery (SES, WhatsApp, SMS) arrives with the notifications task; until then this
 * validates the payload and logs, which is enough to see jobs flow from the API to Redis
 * to the worker.
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
