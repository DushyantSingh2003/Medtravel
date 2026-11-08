'use client';

import { useListPriceItems, type PriceItemDto } from '@medtravel/api-client';
import { formatMoney, type Locale } from '@medtravel/contracts';
import { Badge, Button, EmptyState, Skeleton } from '@medtravel/ui';
import { BadgePercent, History, Pencil, Plus, Tag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AddOnDialog, EditItemDialog, HistoryDialog, PublishDialog } from './price-dialogs';

type Dialog =
  | { kind: 'publish' | 'history' | 'edit'; item: PriceItemDto }
  | { kind: 'add' }
  | null;

/** The three service packages and the add-ons, with the current price in each currency and what changed when. */
export function PriceList() {
  const t = useTranslations('pricing');
  const locale = useLocale() as Locale;
  const list = useListPriceItems();
  const [dialog, setDialog] = useState<Dialog>(null);
  const items = list.data?.data.items ?? [];
  const packages = items.filter((item) => item.kind === 'service_package');
  const addOns = items.filter((item) => item.kind === 'add_on');

  if (list.isPending) return <Skeleton className="h-48 w-full" />;
  if (list.isError)
    return (
      <EmptyState
        title={t('list.failed')}
        icon={<BadgePercent aria-hidden="true" />}
        action={<Button onClick={() => void list.refetch()}>{t('actions.retry')}</Button>}
      />
    );

  const card = (item: PriceItemDto) => (
    <li key={item.code} className="space-y-3 rounded-lg border p-4" data-item={item.code}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">
            <bdi>{item.name}</bdi>
            {item.unit ? (
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                {t('list.per', { unit: item.unit })}
              </span>
            ) : null}
          </h3>
          {item.current ? (
            <p className="text-xs text-muted-foreground">
              {t('list.version', { version: item.current.version })}
            </p>
          ) : null}
        </div>
        {item.active ? null : <Badge variant="muted">{t('list.off')}</Badge>}
      </div>
      {item.inclusions.length > 0 ? (
        <ul className="list-disc space-y-0.5 ps-5 text-sm text-muted-foreground">
          {item.inclusions.map((line) => (
            <li key={line}>
              <bdi>{line}</bdi>
            </li>
          ))}
        </ul>
      ) : null}
      {item.current ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" dir="ltr">
          {item.current.prices.map((p) => (
            <li key={p.currency} className="font-medium">
              {formatMoney({ amountMinor: p.amountMinor, currency: p.currency }, locale)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('list.noPrice')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setDialog({ kind: 'publish', item })}>
          <Tag aria-hidden="true" />
          {t('list.setPrices')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'history', item })}>
          <History aria-hidden="true" />
          {t('list.history')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'edit', item })}>
          <Pencil aria-hidden="true" />
          {t('list.edit')}
        </Button>
      </div>
    </li>
  );

  return (
    <div className="space-y-8">
      <section aria-labelledby="packages-heading" className="space-y-3">
        <h2 id="packages-heading" className="text-lg font-semibold">
          {t('list.packages')}
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">{packages.map(card)}</ul>
      </section>
      <section aria-labelledby="addons-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="addons-heading" className="text-lg font-semibold">
            {t('list.addOns')}
          </h2>
          <Button onClick={() => setDialog({ kind: 'add' })}>
            <Plus aria-hidden="true" />
            {t('list.addAddOn')}
          </Button>
        </div>
        {addOns.length === 0 ? (
          <EmptyState title={t('list.noAddOns')} icon={<Tag aria-hidden="true" />} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">{addOns.map(card)}</ul>
        )}
      </section>
      {dialog?.kind === 'publish' ? (
        <PublishDialog key={dialog.item.code} item={dialog.item} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'history' ? (
        <HistoryDialog item={dialog.item} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <EditItemDialog item={dialog.item} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'add' ? <AddOnDialog onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
