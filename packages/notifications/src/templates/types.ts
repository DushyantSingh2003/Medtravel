import type { NotificationEventKey } from '@medtravel/contracts';

export interface MessageText {
  title: string;
  /** May hold several lines; `{name}` is replaced with the variable of that name. */
  body: string;
}

export type MessageTexts = Record<NotificationEventKey, MessageText>;
