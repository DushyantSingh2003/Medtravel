import { z } from 'zod';

/** Queue name, shared by the API (which enqueues) and the worker (which consumes). */
export const NOTIFICATIONS_QUEUE = 'notifications';

/**
 * Payload of a notification job. Validated on the way in, because a malformed job that is
 * only discovered at send time retries forever and silently fills the dead-letter set.
 */
export const notificationJobSchema = z.object({
  channel: z.enum(['email', 'sms', 'whatsapp']),
  to: z.string().min(1),
  template: z.string().min(1),
  locale: z.enum(['en', 'ar']).default('en'),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type NotificationJob = z.infer<typeof notificationJobSchema>;
