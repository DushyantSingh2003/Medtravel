import { z } from 'zod';
import {
  notificationChannelSchema,
  notificationStatusSchema,
  type NotificationChannel,
} from './enums.js';
import { notificationEventKeySchema, PREFERENCE_CHANNELS } from './notification-events.js';
import { cursorPageSchema, cursorQuerySchema } from './primitives.js';

/** Most attempts at delivering one message before it is marked failed. */
export const NOTIFICATION_MAX_ATTEMPTS = 5;
/** A free-text WhatsApp message is allowed only this long after the person last wrote to us. */
export const WHATSAPP_SESSION_HOURS = 24;

// ---- a person's own notifications -------------------------------------------------------------------------------
export const notificationSchema = z.object({
  id: z.uuid(),
  eventKey: z.string().max(100),
  title: z.string().max(300).nullable(),
  body: z.string().max(4000).nullable(),
  data: z.object({}).catchall(z.unknown()).nullable(),
  caseId: z.uuid().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type NotificationView = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = cursorQuerySchema.extend({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationPageSchema = cursorPageSchema(notificationSchema).extend({
  unread: z.number().int().min(0),
});
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const unreadCountSchema = z.object({ unread: z.number().int().min(0) });

/** Mark some notifications read, or all of them. */
export const markReadSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(100).optional(), all: z.boolean().optional() })
  .strict()
  .refine((value) => Boolean(value.ids) !== Boolean(value.all), 'Give ids, or all, not both');
export type MarkRead = z.infer<typeof markReadSchema>;

// ---- preferences ------------------------------------------------------------------------------------------------
export const preferenceChannelSchema = z.enum(PREFERENCE_CHANNELS);
export const notificationPreferencesSchema = z.object({
  channels: z.array(z.object({ channel: preferenceChannelSchema, enabled: z.boolean() })),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export const setPreferencesSchema = notificationPreferencesSchema.strict();

// ---- the admin log ----------------------------------------------------------------------------------------------
export const notificationLogQuerySchema = cursorQuerySchema.extend({
  channel: notificationChannelSchema.optional(),
  status: notificationStatusSchema.optional(),
  eventKey: z.string().max(100).optional(),
  user: z.string().max(200).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type NotificationLogQuery = z.infer<typeof notificationLogQuerySchema>;

export const notificationLogRowSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  eventKey: z.string().max(100),
  channel: notificationChannelSchema,
  status: notificationStatusSchema,
  locale: z.string().max(8).nullable(),
  provider: z.string().max(40).nullable(),
  attempts: z.number().int().min(0),
  lastError: z.string().max(500).nullable(),
  sentAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  readAt: z.iso.datetime().nullable(),
  failedAt: z.iso.datetime().nullable(),
  userId: z.uuid(),
  userName: z.string().max(200).nullable(),
  userEmail: z.string().max(200).nullable(),
  caseId: z.uuid().nullable(),
});
export type NotificationLogRow = z.infer<typeof notificationLogRowSchema>;
export const notificationLogPageSchema = cursorPageSchema(notificationLogRowSchema);

/** Send the `test_event` to a user (by default, the admin themself) on the channels they have. */
export const sendTestSchema = z
  .object({
    userId: z.uuid().optional(),
    channels: z.array(notificationChannelSchema).min(1).max(5).optional(),
  })
  .strict();
export type SendTest = z.infer<typeof sendTestSchema>;
export const sendTestResultSchema = z.object({
  queued: z.array(z.object({ channel: notificationChannelSchema, id: z.uuid() })),
  skipped: z.array(z.object({ channel: notificationChannelSchema, reason: z.string().max(100) })),
});

export const notificationEventsSchema = z.object({
  events: z.array(
    z.object({
      key: notificationEventKeySchema,
      audience: z.string().max(20),
      category: z.string().max(20),
      channels: z.array(notificationChannelSchema),
    }),
  ),
});

// ---- provider status callbacks ----------------------------------------------------------------------------------
/** What a status callback is reduced to once the provider's own format has been read. */
export const statusUpdateSchema = z.object({
  providerMessageId: z.string().min(1).max(200),
  /** The provider's own id for this callback, so a repeated one is ignored. */
  eventId: z.string().min(1).max(200),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  at: z.iso.datetime().optional(),
  error: z.string().max(300).optional(),
});
export type StatusUpdate = z.infer<typeof statusUpdateSchema>;

/** Order in which a message moves; a callback never moves it back. */
export const STATUS_RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

export type { NotificationChannel };
