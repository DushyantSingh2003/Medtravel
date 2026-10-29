import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  markReadSchema,
  notificationEventsSchema,
  notificationListQuerySchema,
  notificationLogPageSchema,
  notificationLogQuerySchema,
  notificationPageSchema,
  notificationPreferencesSchema,
  sendTestResultSchema,
  sendTestSchema,
  setPreferencesSchema,
  unreadCountSchema,
} from '@medtravel/contracts';

export class NotificationListQueryDto extends createZodDto(notificationListQuerySchema) {}
export class NotificationPageDto extends createZodDto(notificationPageSchema) {}
export class UnreadCountDto extends createZodDto(unreadCountSchema) {}
export class MarkReadDto extends createZodDto(markReadSchema) {}
export class NotificationPreferencesDto extends createZodDto(notificationPreferencesSchema) {}
export class SetPreferencesDto extends createZodDto(setPreferencesSchema) {}
export class NotificationLogQueryDto extends createZodDto(notificationLogQuerySchema) {}
export class NotificationLogPageDto extends createZodDto(notificationLogPageSchema) {}
export class SendTestDto extends createZodDto(sendTestSchema) {}
export class SendTestResultDto extends createZodDto(sendTestResultSchema) {}
export class NotificationEventsDto extends createZodDto(notificationEventsSchema) {}
export class WebhookChannelParamsDto extends createZodDto(
  z.object({ channel: z.enum(['sms', 'whatsapp']) }),
) {}
