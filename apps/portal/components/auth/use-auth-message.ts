'use client';

import { ApiError } from '@medtravel/api-client';
import { useTranslations } from 'next-intl';

/** The sentence a failed sign-in step deserves, for the status the API answered with (or a dropped connection). */
export function useAuthMessage() {
  const t = useTranslations('auth');
  return (error: unknown, wrongCredentials: string): string => {
    if (!(error instanceof ApiError)) return t('common.networkError');
    const body =
      typeof error.body === 'object' && error.body !== null
        ? (error.body as { code?: unknown })
        : {};
    if (error.status === 401) return wrongCredentials;
    if (error.status === 429)
      return body.code === 'account_locked' ? t('login.locked') : t('common.tooMany');
    if (error.status === 400) return t('common.fixErrors');
    return t('common.serverError');
  };
}
