import { getRequestConfig } from 'next-intl/server';
import { loadMessages, type Locale } from '@medtravel/i18n';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = (routing.locales as readonly string[]).includes(requested ?? '')
    ? (requested as Locale)
    : routing.defaultLocale;

  return { locale, messages: loadMessages(locale) };
});
