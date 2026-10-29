import {
  NOTIFICATION_EVENTS,
  notificationLocale,
  whatsappTemplateName,
  type NotificationEventKey,
  type NotificationLocale,
} from '@medtravel/contracts';
import { renderNotificationEmail } from '@medtravel/emails';
import { AR } from './templates/ar.js';
import { EN } from './templates/en.js';
import type { MessageText, MessageTexts } from './templates/types.js';

const TEXTS: Record<NotificationLocale, MessageTexts> = { en: EN, ar: AR };

export type TemplateData = Record<string, string | number>;

/** Replaces `{name}` with the value of that variable; a variable that was not given becomes empty, never the literal `{name}`. */
export function fill(template: string, data: TemplateData): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(data[name] ?? ''));
}

/** The text of an event for a person's language (English when there is none), with the data put in. */
export function renderText(
  key: NotificationEventKey,
  language: string | null | undefined,
  data: TemplateData,
): MessageText & { locale: NotificationLocale } {
  const locale = notificationLocale(language);
  const text = TEXTS[locale][key];
  return { locale, title: fill(text.title, data), body: fill(text.body, data) };
}

/** Placeholder names in a text, for the registry spec. */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string);
}

export const TEMPLATE_TEXTS = TEXTS;

const FOOTER: Record<NotificationLocale, string> = {
  en: 'Sent by MedTravel. You can choose which messages you receive in your account settings.',
  ar: 'أُرسلت من MedTravel. يمكنك اختيار الرسائل التي تصلك من إعدادات حسابك.',
};

export async function renderEmail(
  key: NotificationEventKey,
  language: string | null | undefined,
  data: TemplateData,
): Promise<{ subject: string; text: string; html: string; locale: NotificationLocale }> {
  const { locale, title, body } = renderText(key, language, data);
  const html = await renderNotificationEmail({ title, body, locale, footer: FOOTER[locale] });
  return { subject: title, text: `${title}\n\n${body}\n\n${FOOTER[locale]}`, html, locale };
}

/** The approved WhatsApp template for an event: its name, the language code and the ordered parameters. */
export function whatsappTemplate(
  key: NotificationEventKey,
  language: string | null | undefined,
  data: TemplateData,
): { name: string; language: NotificationLocale; parameters: string[] } {
  return {
    name: whatsappTemplateName(key),
    language: notificationLocale(language),
    parameters: NOTIFICATION_EVENTS[key].variables.map((variable) => String(data[variable] ?? '')),
  };
}
