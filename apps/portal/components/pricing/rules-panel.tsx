'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  getGetDiscountThresholdsQueryKey,
  getGetMarginRulesQueryKey,
  useGetDiscountThresholds,
  useGetMarginRules,
  useUpdateDiscountThresholds,
  useUpdateMarginRules,
} from '@medtravel/api-client';
import { DISCOUNT_ROLES, QUOTE_LINE_KINDS } from '@medtravel/contracts';
import { Button, EmptyState, FormInput, Skeleton, toast } from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Percent } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { fieldProblems } from '../../lib/api-errors';
import { bpFromPercent, percentFromBp } from './percent';

/** Components that carry a margin: every kind of quote line except the discount. */
const COMPONENTS = QUOTE_LINE_KINDS.filter((kind) => kind !== 'discount');

const percentField = z.string().refine((text) => bpFromPercent(text) !== null, {
  message: 'A percentage such as 15 or 12.5',
});
const marginsFormSchema = z.object({
  rows: z.array(z.object({ component: z.string(), percent: percentField })),
});
const discountsFormSchema = z.object({
  rows: z.array(z.object({ role: z.string(), percent: percentField })),
});
type MarginsValues = z.infer<typeof marginsFormSchema>;
type DiscountsValues = z.infer<typeof discountsFormSchema>;

/** Our margin per quote component, and the biggest discount each role may give without approval. */
export function RulesPanel() {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <MarginsForm />
      <DiscountsForm />
    </div>
  );
}

function MarginsForm() {
  const t = useTranslations('pricing.rules');
  const kinds = useTranslations('pricing.kinds');
  const queryClient = useQueryClient();
  const margins = useGetMarginRules();
  const save = useUpdateMarginRules();
  const form = useForm<MarginsValues>({
    resolver: zodResolver(marginsFormSchema),
    defaultValues: { rows: COMPONENTS.map((component) => ({ component, percent: '0' })) },
  });
  const saved = margins.data?.data.rules;
  useEffect(() => {
    if (!saved) return;
    form.reset({
      rows: COMPONENTS.map((component) => ({
        component,
        percent: percentFromBp(saved.find((r) => r.component === component)?.marginBp ?? 0),
      })),
    });
  }, [saved, form]);

  const submit = form.handleSubmit(async ({ rows }) => {
    try {
      await save.mutateAsync({
        data: {
          rules: rows.map((row) => ({
            component: row.component as (typeof COMPONENTS)[number],
            marginBp: bpFromPercent(row.percent) ?? 0,
          })),
        },
      });
      toast.success(t('margins.saved'));
      await queryClient.invalidateQueries({ queryKey: getGetMarginRulesQueryKey() });
    } catch (error) {
      form.setError('root', { message: fieldProblems(error)[0]?.message ?? t('failed') });
    }
  });

  if (margins.isPending) return <Skeleton className="h-64 w-full" />;
  if (margins.isError)
    return <EmptyState title={t('loadFailed')} icon={<Percent aria-hidden="true" />} />;
  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-labelledby="margins-heading">
      <div>
        <h2 id="margins-heading" className="text-lg font-semibold">
          {t('margins.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('margins.hint')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {COMPONENTS.map((component, index) => (
          <FormInput
            key={component}
            control={form.control}
            name={`rows.${index}.percent`}
            label={t('percentOf', { name: kinds(component) })}
            dir="ltr"
          />
        ))}
      </div>
      {form.formState.errors.root?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={form.formState.isSubmitting}>
        {t('margins.save')}
      </Button>
    </form>
  );
}

function DiscountsForm() {
  const t = useTranslations('pricing.rules');
  const roles = useTranslations('roles');
  const queryClient = useQueryClient();
  const thresholds = useGetDiscountThresholds();
  const save = useUpdateDiscountThresholds();
  const form = useForm<DiscountsValues>({
    resolver: zodResolver(discountsFormSchema),
    defaultValues: { rows: DISCOUNT_ROLES.map((role) => ({ role, percent: '0' })) },
  });
  const saved = thresholds.data?.data.thresholds;
  useEffect(() => {
    if (!saved) return;
    form.reset({
      rows: DISCOUNT_ROLES.map((role) => ({
        role,
        percent: percentFromBp(saved.find((r) => r.role === role)?.maxBp ?? 0),
      })),
    });
  }, [saved, form]);

  const submit = form.handleSubmit(async ({ rows }) => {
    try {
      await save.mutateAsync({
        data: {
          thresholds: rows.map((row) => ({
            role: row.role as (typeof DISCOUNT_ROLES)[number],
            maxBp: bpFromPercent(row.percent) ?? 0,
          })),
        },
      });
      toast.success(t('discounts.saved'));
      await queryClient.invalidateQueries({ queryKey: getGetDiscountThresholdsQueryKey() });
    } catch (error) {
      form.setError('root', { message: fieldProblems(error)[0]?.message ?? t('failed') });
    }
  });

  if (thresholds.isPending) return <Skeleton className="h-64 w-full" />;
  if (thresholds.isError)
    return <EmptyState title={t('loadFailed')} icon={<Percent aria-hidden="true" />} />;
  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-labelledby="discounts-heading">
      <div>
        <h2 id="discounts-heading" className="text-lg font-semibold">
          {t('discounts.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('discounts.hint')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {DISCOUNT_ROLES.map((role, index) => (
          <FormInput
            key={role}
            control={form.control}
            name={`rows.${index}.percent`}
            label={t('discounts.upTo', { role: roles(role) })}
            dir="ltr"
          />
        ))}
      </div>
      {form.formState.errors.root?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={form.formState.isSubmitting}>
        {t('discounts.save')}
      </Button>
    </form>
  );
}
