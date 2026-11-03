'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from '@medtravel/ui';
import { useRouter } from '../../i18n/navigation';
import { useRealtimeEvent } from '../realtime/realtime-provider';

/**
 * Signs the browser out the moment the server says the session ended (the account was deactivated, the two-factor was reset),
 * instead of at the next request. Renders nothing.
 */
export function SessionWatcher() {
  const t = useTranslations('users.signedOut');
  const router = useRouter();
  const queryClient = useQueryClient();
  useRealtimeEvent('session.revoked', (message) => {
    const reason = (message.payload as { reason?: string }).reason;
    queryClient.clear();
    toast.error(reason === 'two_factor_reset' ? t('twoFactorReset') : t('deactivated'));
    router.replace('/login');
    router.refresh();
  });
  return null;
}
