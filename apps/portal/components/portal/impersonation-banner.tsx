'use client';

import { useGetMe, useStopImpersonation } from '@medtravel/api-client';
import { ImpersonationBanner as Banner, toast } from '@medtravel/ui';
import { useTranslations } from 'next-intl';

/**
 * Across the top of every screen for as long as a super admin is looking at the product as someone else. Stopping reloads the
 * page, so nothing from the other person's view stays on screen.
 */
export function ImpersonationBar({ afterStopHref }: { afterStopHref: string }) {
  const t = useTranslations('users.banner');
  const roles = useTranslations('roles');
  const me = useGetMe();
  const stop = useStopImpersonation();
  const user = me.data?.data;
  if (!user?.impersonating) return null;
  return (
    <Banner
      message={t('message', { name: user.name, role: roles(user.role) })}
      stopLabel={t('stop')}
      busy={stop.isPending}
      onStop={() =>
        stop.mutate(undefined, {
          onSuccess: () => window.location.assign(afterStopHref),
          onError: () => toast.error(t('stopFailed')),
        })
      }
    />
  );
}
