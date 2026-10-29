'use client';

import {
  getListNotificationsQueryKey,
  useListNotifications,
  useMarkNotificationsRead,
} from '@medtravel/api-client';
import type { Locale } from '@medtravel/contracts';
import { NotificationsMenu, intlLocale } from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { relativeTime } from '../../lib/notifications/relative-time';

/** The bell is refreshed by the realtime push; this slow poll only covers a connection that is down. */
const POLL_MS = 5 * 60_000;

/** The bell in the top bar: the person's latest notifications and how many are unread. */
export function NotificationsBell() {
  const t = useTranslations('shell');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const list = useListNotifications({ limit: 10 }, { query: { refetchInterval: POLL_MS } });
  const markRead = useMarkNotificationsRead({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey().slice(0, 1) }),
    },
  });
  const page = list.data?.data;
  // Relative times are measured from when the list was last fetched, which also keeps rendering pure.
  const now = list.dataUpdatedAt;

  return (
    <NotificationsMenu
      label={t('notifications')}
      emptyLabel={t('notificationsEmpty')}
      unreadLabel={(count) => t('unread', { count })}
      status={list.isPending ? 'loading' : list.isError ? 'error' : 'ready'}
      loadingLabel={t('notificationsLoading')}
      errorLabel={t('notificationsError')}
      markAllLabel={t('notificationsMarkAll')}
      items={(page?.items ?? []).map((item) => ({
        id: item.id,
        title: item.title ?? item.eventKey,
        ...(item.body ? { body: item.body } : {}),
        timeLabel: relativeTime(item.createdAt, intlLocale(locale), now),
        unread: item.readAt === null,
      }))}
      unreadCount={page?.unread ?? 0}
      onItemSelect={(id) => {
        const item = page?.items.find((entry) => entry.id === id);
        if (item && item.readAt === null) markRead.mutate({ data: { ids: [id] } });
      }}
      onMarkAllRead={() => markRead.mutate({ data: { all: true } })}
    />
  );
}
