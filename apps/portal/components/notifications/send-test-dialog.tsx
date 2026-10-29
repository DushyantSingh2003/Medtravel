'use client';

import {
  getListNotificationLogQueryKey,
  useSendTestNotification,
  type SendTestResultDto,
} from '@medtravel/api-client';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Sends the test notification to the admin's own account and says what was queued and what was skipped, and why. */
export function SendTestDialog({ open, onOpenChange }: Props) {
  const t = useTranslations('notifications.log');
  const queryClient = useQueryClient();
  const [result, setResult] = useState<SendTestResultDto | null>(null);
  const send = useSendTestNotification({
    mutation: {
      onSuccess: (response) => {
        setResult(response.data);
        void queryClient.invalidateQueries({
          queryKey: getListNotificationLogQueryKey().slice(0, 1),
        });
      },
    },
  });
  const close = (next: boolean) => {
    if (!next) {
      setResult(null);
      send.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent closeLabel={t('test.close')}>
        <DialogHeader>
          <DialogTitle>{t('test.title')}</DialogTitle>
          <DialogDescription>{t('test.description')}</DialogDescription>
        </DialogHeader>
        <div aria-live="polite" className="space-y-2 text-sm">
          {send.isError ? (
            <p role="alert" className="text-destructive">
              {t('test.failed')}
            </p>
          ) : null}
          {result ? (
            <>
              <p className="font-medium">{t('test.queued', { count: result.queued.length })}</p>
              <ul className="list-inside list-disc text-muted-foreground">
                {result.queued.map((item) => (
                  <li key={item.id}>{t(`channels.${item.channel}`)}</li>
                ))}
                {result.skipped.map((item) => (
                  <li key={`${item.channel}-${item.reason}`}>
                    {t('test.skipped', {
                      channel: t(`channels.${item.channel}`),
                      reason: t.has(`test.reasons.${item.reason}`)
                        ? t(`test.reasons.${item.reason}`)
                        : item.reason,
                    })}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t('test.close')}
          </Button>
          <Button disabled={send.isPending} onClick={() => send.mutate({ data: {} })}>
            {send.isPending ? t('test.sending') : t('test.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
