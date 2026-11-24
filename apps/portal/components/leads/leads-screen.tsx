'use client';

import {
  getListLeadsQueryKey,
  useCreateLead,
  useListLeads,
  type LeadPageDtoItemsItem,
} from '@medtravel/api-client';
import { CASE_SOURCES, DUPLICATE_STATES, createLeadSchema, type Locale } from '@medtravel/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormInput,
  FormSelect,
  FormTextarea,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@medtravel/ui';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { fieldProblems } from '../../lib/api-errors';
import { useDebounced } from '../users/use-debounced';
import { LeadDialog } from './lead-dialog';

const ALL = 'all';

/** Every lead from every source in one list, newest first, with the possible duplicates marked. */
export function LeadsScreen() {
  const t = useTranslations('leads');
  const locale = useLocale() as Locale;
  const id = useId();
  const [text, setText] = useState('');
  const [source, setSource] = useState<string>(ALL);
  const [duplicate, setDuplicate] = useState<string>(ALL);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(text);
  const cursor = cursors[cursors.length - 1];
  const list = useListLeads(
    {
      limit: 10,
      ...(q.length > 0 ? { q } : {}),
      ...(source === ALL ? {} : { source: source as (typeof CASE_SOURCES)[number] }),
      ...(duplicate === ALL ? {} : { duplicate: duplicate as (typeof DUPLICATE_STATES)[number] }),
      ...(cursor ? { cursor } : {}),
    },
    { query: { placeholderData: keepPreviousData } },
  );
  const page = list.data?.data;
  const when = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const restart = () => setCursors([undefined]);

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={`${id}-h`} className="sr-only">
          {t('list.title')}
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-q`}>{t('filters.search')}</Label>
            <Input
              id={`${id}-q`}
              type="search"
              value={text}
              onChange={(e) => (setText(e.target.value), restart())}
              className="w-64"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-source`}>{t('filters.source')}</Label>
            <Select value={source} onValueChange={(v) => (setSource(v), restart())}>
              <SelectTrigger id={`${id}-source`} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
                {CASE_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`sources.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-dup`}>{t('filters.duplicate')}</Label>
            <Select value={duplicate} onValueChange={(v) => (setDuplicate(v), restart())}>
              <SelectTrigger id={`${id}-dup`} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
                {DUPLICATE_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`duplicate.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t('new.open')}
        </Button>
      </div>

      {list.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : list.isError ? (
        <EmptyState
          title={t('list.failed')}
          icon={<Inbox aria-hidden="true" />}
          action={<Button onClick={() => void list.refetch()}>{t('retry')}</Button>}
        />
      ) : page && page.items.length === 0 ? (
        <EmptyState title={t('list.empty')} description={t('list.emptyHint')} icon={<Inbox aria-hidden="true" />} />
      ) : (
        <>
          <ul className="divide-y rounded-lg border" aria-label={t('list.title')}>
            {page?.items.map((lead) => (
              <LeadItem key={lead.id} lead={lead} when={when} onOpen={() => setOpen(lead.id)} />
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t('list.total', { count: page?.total ?? 0 })}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={cursors.length === 1} onClick={() => setCursors((c) => c.slice(0, -1))}>
                {t('previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!page?.nextCursor}
                onClick={() => page?.nextCursor && setCursors((c) => [...c, page.nextCursor ?? undefined])}
              >
                {t('next')}
              </Button>
            </div>
          </div>
        </>
      )}
      {open ? <LeadDialog id={open} onClose={() => setOpen(null)} /> : null}
      {creating ? <NewLeadDialog onClose={() => setCreating(false)} onCreated={restart} /> : null}
    </section>
  );
}

function LeadItem({ lead, when, onOpen }: { lead: LeadPageDtoItemsItem; when: Intl.DateTimeFormat; onOpen: () => void }) {
  const t = useTranslations('leads');
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3" data-lead={lead.caseNo}>
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">
          <bdi>{lead.name}</bdi>
          <span className="ms-2 text-sm font-normal text-muted-foreground" dir="ltr">
            {lead.caseNo}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {t(`sources.${lead.source}`)}
          {lead.utmCampaign ? ` · ${lead.utmCampaign}` : ''} · {when.format(new Date(lead.createdAt))}
        </p>
        <p className="text-sm text-muted-foreground" dir="ltr">
          {[lead.phone, lead.email].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {lead.duplicateState === 'possible' ? <Badge variant="warning">{t('duplicate.possible')}</Badge> : null}
        {lead.assigned ? null : <Badge variant="info">{t('unassigned')}</Badge>}
        <Button size="sm" variant="outline" onClick={onOpen}>
          {t('open')}
        </Button>
      </div>
    </li>
  );
}

type NewValues = z.input<typeof createLeadSchema>;

function NewLeadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useTranslations('leads');
  const queryClient = useQueryClient();
  const create = useCreateLead();
  const form = useForm<NewValues>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: { source: 'phone', name: '', phone: '', email: '', passportNumber: '', message: '' },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      const { data } = await create.mutateAsync({ data: values as never });
      toast.success(data.attachedToExisting ? t('new.attached') : t('new.created', { caseNo: data.caseNo }));
      await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey().slice(0, 1) });
      onCreated();
      onClose();
    } catch (error) {
      const problems = fieldProblems(error);
      if (problems.length === 0) form.setError('root', { message: t('new.failed') });
      for (const p of problems) form.setError(p.path as 'name', { message: p.message });
    }
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('close')} className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('new.title')}</DialogTitle>
          </DialogHeader>
          <FormSelect
            control={form.control}
            name="source"
            label={t('new.source')}
            placeholder={t('new.source')}
            options={CASE_SOURCES.map((value) => ({ value, label: t(`sources.${value}`) }))}
          />
          <FormInput control={form.control} name="name" label={t('new.name')} required requiredLabel={t('required')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput control={form.control} name="phone" label={t('new.phone')} description={t('new.phoneHint')} dir="ltr" />
            <FormInput control={form.control} name="email" label={t('new.email')} type="email" dir="ltr" />
          </div>
          <FormInput control={form.control} name="passportNumber" label={t('new.passport')} description={t('new.passportHint')} dir="ltr" />
          <FormTextarea control={form.control} name="message" label={t('new.message')} rows={4} />
          {form.formState.errors.root?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('new.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
