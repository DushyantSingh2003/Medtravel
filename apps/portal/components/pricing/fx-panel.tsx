'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  getGetFxSettingsQueryKey,
  getListFxOverridesQueryKey,
  useCreateFxOverride,
  useGetFxSettings,
  useListFxOverrides,
  useRevokeFxOverride,
  useUpdateFxSettings,
  type FxOverrideDto,
} from '@medtravel/api-client';
import { FX_PROVIDERS, createFxOverrideSchema, type Locale } from '@medtravel/contracts';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormInput,
  FormSelect,
  Skeleton,
  toast,
} from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { fieldProblems } from '../../lib/api-errors';
import { bpFromPercent, percentFromBp } from './percent';
import { useCurrencyCodes } from './use-currencies';

const ENVIRONMENT = 'environment';

const settingsFormSchema = z.object({
  provider: z.string(),
  markup: z.string().refine((text) => {
    const bp = bpFromPercent(text);
    return bp !== null && bp <= 5000;
  }, 'A percentage from 0 to 50'),
});
type SettingsValues = z.infer<typeof settingsFormSchema>;

/** Where daily rates come from, the markup added when we convert, and rates set by hand. */
export function FxPanel() {
  return (
    <div className="space-y-8">
      <SettingsForm />
      <Overrides />
    </div>
  );
}

function SettingsForm() {
  const t = useTranslations('pricing.fx');
  const queryClient = useQueryClient();
  const settings = useGetFxSettings();
  const save = useUpdateFxSettings();
  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: { provider: ENVIRONMENT, markup: '0' },
  });
  const saved = settings.data?.data;
  useEffect(() => {
    if (saved)
      form.reset({ provider: saved.provider ?? ENVIRONMENT, markup: percentFromBp(saved.markupBp) });
  }, [saved, form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        data: {
          provider:
            values.provider === ENVIRONMENT
              ? null
              : (values.provider as (typeof FX_PROVIDERS)[number]),
          markupBp: bpFromPercent(values.markup) ?? 0,
        },
      });
      toast.success(t('settings.saved'));
      await queryClient.invalidateQueries({ queryKey: getGetFxSettingsQueryKey() });
    } catch (error) {
      form.setError('root', { message: fieldProblems(error)[0]?.message ?? t('failed') });
    }
  });

  if (settings.isPending) return <Skeleton className="h-40 w-full" />;
  if (settings.isError)
    return <EmptyState title={t('loadFailed')} icon={<ArrowLeftRight aria-hidden="true" />} />;
  return (
    <form onSubmit={submit} noValidate className="max-w-xl space-y-4" aria-labelledby="fx-heading">
      <div>
        <h2 id="fx-heading" className="text-lg font-semibold">
          {t('settings.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('settings.hint')}</p>
      </div>
      <FormSelect
        control={form.control}
        name="provider"
        label={t('settings.provider')}
        placeholder={t('settings.provider')}
        description={t('settings.providerHint')}
        options={[
          { value: ENVIRONMENT, label: t('settings.environment') },
          ...FX_PROVIDERS.map((value) => ({ value, label: t(`providers.${value}`) })),
        ]}
      />
      <FormInput
        control={form.control}
        name="markup"
        label={t('settings.markup')}
        description={t('settings.markupHint')}
        dir="ltr"
      />
      {form.formState.errors.root?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={form.formState.isSubmitting}>
        {t('settings.save')}
      </Button>
    </form>
  );
}

function Overrides() {
  const t = useTranslations('pricing.fx');
  const actions = useTranslations('pricing.actions');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const list = useListFxOverrides();
  const revoke = useRevokeFxOverride();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<FxOverrideDto | null>(null);
  const items = list.data?.data.items ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListFxOverridesQueryKey() });
  const when = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <section aria-labelledby="overrides-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="overrides-heading" className="text-lg font-semibold">
            {t('overrides.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('overrides.hint')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t('overrides.add')}
        </Button>
      </div>
      {list.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : list.isError ? (
        <EmptyState title={t('loadFailed')} icon={<ArrowLeftRight aria-hidden="true" />} />
      ) : items.length === 0 ? (
        <EmptyState title={t('overrides.empty')} icon={<ArrowLeftRight aria-hidden="true" />} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium" dir="ltr">
                  1 {o.base} = {o.rate} {o.quote}
                  <Badge variant={o.active ? 'success' : 'muted'} className="ms-2">
                    {o.active
                      ? t('overrides.active')
                      : o.revokedAt
                        ? t('overrides.removed')
                        : t('overrides.expired')}
                  </Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  <bdi>{o.reason}</bdi>
                </p>
                <p className="text-xs text-muted-foreground">
                  {when.format(new Date(o.createdAt))}
                  {o.createdByName ? ` · ${o.createdByName}` : ''}
                  {o.expiresAt ? ` · ${t('overrides.until', { when: when.format(new Date(o.expiresAt)) })}` : ''}
                </p>
              </div>
              {o.active ? (
                <Button variant="outline" size="sm" onClick={() => setRemoving(o)}>
                  {t('overrides.remove')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <OverrideDialog
          onClose={() => setCreating(false)}
          onSaved={() => void refresh()}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t('overrides.removeTitle')}
        description={t('overrides.removeBody')}
        confirmLabel={t('overrides.remove')}
        cancelLabel={actions('cancel')}
        closeLabel={actions('close')}
        errorLabel={actions('error')}
        onConfirm={async () => {
          if (!removing) return;
          await revoke.mutateAsync({ id: removing.id });
          toast.success(t('overrides.removedDone'));
          setRemoving(null);
          await refresh();
        }}
      />
    </section>
  );
}

type OverrideValues = z.input<typeof createFxOverrideSchema>;

function OverrideDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('pricing.fx');
  const actions = useTranslations('pricing.actions');
  const { codes } = useCurrencyCodes();
  const create = useCreateFxOverride();
  const form = useForm<OverrideValues>({
    resolver: zodResolver(createFxOverrideSchema),
    defaultValues: { base: 'USD', quote: 'INR', rate: '', reason: '' },
  });
  const options = codes.map((code) => ({ value: code, label: code }));
  const submit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync({ data: values });
      toast.success(t('overrides.saved'));
      onSaved();
      onClose();
    } catch (error) {
      const problems = fieldProblems(error);
      if (problems.length === 0) form.setError('root', { message: t('failed') });
      for (const problem of problems)
        form.setError(problem.path as 'rate', { message: problem.message });
    }
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={actions('close')}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('overrides.addTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <FormSelect
              control={form.control}
              name="base"
              label={t('overrides.base')}
              placeholder={t('overrides.base')}
              options={options}
            />
            <FormSelect
              control={form.control}
              name="quote"
              label={t('overrides.quote')}
              placeholder={t('overrides.quote')}
              options={options}
            />
          </div>
          <FormInput
            control={form.control}
            name="rate"
            label={t('overrides.rate')}
            description={t('overrides.rateHint')}
            dir="ltr"
            required
          />
          <FormInput
            control={form.control}
            name="reason"
            label={t('overrides.reason')}
            description={t('overrides.reasonHint')}
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
              {t('overrides.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
