'use client';

import {
  getGetNotificationPreferencesQueryKey,
  useGetNotificationPreferences,
  useSetNotificationPreferences,
} from '@medtravel/api-client';
import { PREFERENCE_CHANNELS } from '@medtravel/contracts';
import { Card, CardContent, ErrorState, Skeleton, Switch, toast } from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

type Channel = (typeof PREFERENCE_CHANNELS)[number];

/** One switch per channel: where a person wants to hear from us. Saved the moment it is switched. */
export function PreferencesPanel() {
  const t = useTranslations('notifications.preferences');
  const queryClient = useQueryClient();
  const preferences = useGetNotificationPreferences();
  const save = useSetNotificationPreferences({
    mutation: {
      onSuccess: (response) => {
        queryClient.setQueryData(getGetNotificationPreferencesQueryKey(), response);
        toast.success(t('saved'));
      },
      onError: () => toast.error(t('saveFailed')),
    },
  });

  if (preferences.isPending)
    return (
      <div className="space-y-3" role="status" aria-label={t('loading')}>
        {PREFERENCE_CHANNELS.map((channel) => (
          <Skeleton key={channel} className="h-20 w-full" />
        ))}
      </div>
    );
  if (preferences.isError)
    return (
      <ErrorState
        title={t('errorTitle')}
        description={t('errorDescription')}
        retryLabel={t('retry')}
        onRetry={() => void preferences.refetch()}
      />
    );

  const enabled = new Map(
    (preferences.data.data.channels ?? []).map((item) => [item.channel as Channel, item.enabled]),
  );
  return (
    <section aria-labelledby="channels-heading" className="space-y-4">
      <h2 id="channels-heading" className="text-lg font-semibold">
        {t('channelsTitle')}
      </h2>
      <ul className="space-y-3">
        {PREFERENCE_CHANNELS.map((channel) => {
          const id = `pref-${channel}`;
          return (
            <li key={channel}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <label htmlFor={id} className="block font-medium">
                      {t(`channels.${channel}.name`)}
                    </label>
                    <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                      {t(`channels.${channel}.hint`)}
                    </p>
                  </div>
                  <Switch
                    id={id}
                    aria-describedby={`${id}-hint`}
                    checked={enabled.get(channel) ?? true}
                    disabled={save.isPending}
                    onCheckedChange={(checked) =>
                      save.mutate({ data: { channels: [{ channel, enabled: checked }] } })
                    }
                  />
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">{t('inApp')}</p>
    </section>
  );
}
