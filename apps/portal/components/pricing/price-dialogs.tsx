'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  getListPriceItemsQueryKey,
  useCreateAddOn,
  useGetPriceHistory,
  usePublishPrice,
  useUpdatePriceItem,
  type PriceItemDto,
} from '@medtravel/api-client';
import {
  PRICING_BASE_CURRENCY,
  createAddOnSchema,
  publishPriceSchema,
  updatePriceItemSchema,
  type Locale,
} from '@medtravel/contracts';
import { formatMoney } from '@medtravel/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormCurrencyInput,
  FormInput,
  FormSwitch,
  FormTextarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { History, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { fieldProblems } from '../../lib/api-errors';
import { useCurrencyCodes } from './use-currencies';

const useRefreshPrices = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getListPriceItemsQueryKey().slice(0, 1) });
};

/** Text lines (one per line) as the list the API stores, and back. */
const toLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

type PublishValues = z.input<typeof publishPriceSchema>;

/** Sets the prices of an item in each currency as a new version; the old version stays in the history. */
export function PublishDialog({ item, onClose }: { item: PriceItemDto; onClose: () => void }) {
  const t = useTranslations('pricing');
  const actions = useTranslations('pricing.actions');
  const locale = useLocale() as Locale;
  const refresh = useRefreshPrices();
  const publish = usePublishPrice();
  const { codes } = useCurrencyCodes();
  const [adding, setAdding] = useState('');
  const form = useForm<PublishValues>({
    resolver: zodResolver(publishPriceSchema),
    defaultValues: {
      prices: item.current?.prices ?? [{ currency: PRICING_BASE_CURRENCY, amountMinor: 0 }],
      note: '',
    },
  });
  const rows = useFieldArray({ control: form.control, name: 'prices' });
  const used = new Set(rows.fields.map((row) => row.currency));
  const free = codes.filter((code) => !used.has(code));

  const submit = form.handleSubmit(async (values) => {
    try {
      await publish.mutateAsync({ code: item.code, data: values });
      toast.success(t('publish.done'));
      await refresh();
      onClose();
    } catch (error) {
      const problems = fieldProblems(error);
      if (problems.length === 0) form.setError('root', { message: t('publish.failed') });
      for (const problem of problems)
        form.setError(problem.path === 'prices' ? 'root' : (problem.path as 'note'), {
          message: problem.message,
        });
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={actions('close')}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('publish.title', { name: item.name })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('publish.hint')}</p>
          <div className="space-y-3">
            {rows.fields.map((row, index) => (
              <div key={row.id} className="flex items-end gap-2">
                <FormCurrencyInput
                  control={form.control}
                  name={`prices.${index}.amountMinor`}
                  label={t('publish.priceIn', { currency: row.currency })}
                  currency={row.currency}
                  locale={locale}
                  className="flex-1"
                />
                {row.currency === PRICING_BASE_CURRENCY ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('publish.remove', { currency: row.currency })}
                    onClick={() => rows.remove(index)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {free.length > 0 ? (
            <div className="flex items-center gap-2">
              <Select value={adding} onValueChange={setAdding}>
                <SelectTrigger aria-label={t('publish.addCurrency')} className="w-40">
                  <SelectValue placeholder={t('publish.addCurrency')} />
                </SelectTrigger>
                <SelectContent>
                  {free.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                disabled={!adding}
                onClick={() => {
                  rows.append({ currency: adding, amountMinor: 0 });
                  setAdding('');
                }}
              >
                <Plus aria-hidden="true" />
                {t('publish.add')}
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{t('publish.convertedHint')}</p>
          <FormInput control={form.control} name="note" label={t('publish.note')} />
          {form.formState.errors.root?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {actions('cancel')}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('publish.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Every version of an item's prices, newest first. */
export function HistoryDialog({ item, onClose }: { item: PriceItemDto; onClose: () => void }) {
  const t = useTranslations('pricing');
  const actions = useTranslations('pricing.actions');
  const locale = useLocale() as Locale;
  const history = useGetPriceHistory(item.code);
  const versions = history.data?.data.versions ?? [];
  const when = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={actions('close')}>
        <DialogHeader>
          <DialogTitle>{t('history.title', { name: item.name })}</DialogTitle>
        </DialogHeader>
        {history.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : history.isError ? (
          <EmptyState title={t('history.failed')} icon={<History aria-hidden="true" />} />
        ) : versions.length === 0 ? (
          <EmptyState title={t('history.empty')} icon={<History aria-hidden="true" />} />
        ) : (
          <ol className="max-h-96 space-y-3 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {t('history.version', { version: v.version })}
                  <span className="ms-2 font-normal text-muted-foreground">
                    {when.format(new Date(v.createdAt))}
                    {v.createdByName ? ` · ${v.createdByName}` : ''}
                  </span>
                </p>
                <p className="mt-1 text-sm" dir="ltr">
                  {v.prices
                    .map((p) =>
                      formatMoney({ amountMinor: p.amountMinor, currency: p.currency }, locale),
                    )
                    .join(' · ')}
                </p>
                {v.note ? <p className="mt-1 text-sm text-muted-foreground">{v.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DetailsValues {
  name: string;
  inclusions: string;
  unit?: string;
  active: boolean;
}

/** Changes what an item is called, what it includes and whether it is offered. */
export function EditItemDialog({ item, onClose }: { item: PriceItemDto; onClose: () => void }) {
  const t = useTranslations('pricing');
  const actions = useTranslations('pricing.actions');
  const refresh = useRefreshPrices();
  const update = useUpdatePriceItem();
  const form = useForm<DetailsValues>({
    defaultValues: {
      name: item.name,
      inclusions: item.inclusions.join('\n'),
      unit: item.unit ?? '',
      active: item.active,
    },
  });
  const submit = form.handleSubmit(async (values) => {
    const data = {
      name: values.name,
      inclusions: toLines(values.inclusions),
      active: values.active,
      ...(item.kind === 'add_on' ? { unit: values.unit ?? '' } : {}),
    };
    const parsed = updatePriceItemSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        form.setError((issue.path[0] === 'inclusions' ? 'inclusions' : (issue.path[0] as 'name')) ?? 'name', {
          message: issue.message,
        });
      return;
    }
    try {
      await update.mutateAsync({ code: item.code, data: parsed.data });
      toast.success(t('edit.done'));
      await refresh();
      onClose();
    } catch (error) {
      const problems = fieldProblems(error);
      if (problems.length === 0) form.setError('root', { message: t('edit.failed') });
      for (const problem of problems)
        form.setError(problem.path as 'name', { message: problem.message });
    }
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={actions('close')}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('edit.title', { name: item.name })}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="name" label={t('fields.name')} required />
          {item.kind === 'add_on' ? (
            <FormInput control={form.control} name="unit" label={t('fields.unit')} />
          ) : null}
          <FormTextarea
            control={form.control}
            name="inclusions"
            label={t('fields.inclusions')}
            description={t('fields.inclusionsHint')}
            rows={5}
          />
          <FormSwitch control={form.control} name="active" label={t('fields.active')} />
          {form.formState.errors.root?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {actions('cancel')}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('edit.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type AddOnValues = z.input<typeof createAddOnSchema>;

/** A new add-on for the price list; its price is set afterwards. */
export function AddOnDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('pricing');
  const actions = useTranslations('pricing.actions');
  const refresh = useRefreshPrices();
  const create = useCreateAddOn();
  const form = useForm<AddOnValues>({
    resolver: zodResolver(createAddOnSchema),
    defaultValues: { code: '', name: '', unit: '', inclusions: [] },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync({ data: values });
      toast.success(t('addOn.done'));
      await refresh();
      onClose();
    } catch (error) {
      const problems = fieldProblems(error);
      if (problems.length === 0) form.setError('root', { message: t('addOn.failed') });
      for (const problem of problems)
        form.setError(problem.path as 'code', { message: problem.message });
    }
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={actions('close')}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('addOn.title')}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="name" label={t('fields.name')} required />
          <FormInput
            control={form.control}
            name="code"
            label={t('fields.code')}
            description={t('fields.codeHint')}
            dir="ltr"
            required
          />
          <FormInput
            control={form.control}
            name="unit"
            label={t('fields.unit')}
            description={t('fields.unitHint')}
            required
          />
          {form.formState.errors.root?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {actions('cancel')}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('addOn.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
