'use client';

import {
  getGetPartnerRequestQueryKey,
  getListPartnerRequestsQueryKey,
  useApprovePartnerRequest,
  useGetPartnerRequest,
  useListPartnerRequests,
  useRejectPartnerRequest,
} from '@medtravel/api-client';
import { rejectRequestSchema, type Locale } from '@medtravel/contracts';
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
  FormTextarea,
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
import { Inbox } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { fieldProblems } from '../../lib/api-errors';
import { dateTime, diffText } from './format';

const ALL = 'all';
const STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
const KINDS = ['hospital_onboarding', 'hospital_profile', 'package_price'] as const;
const STATUS_VARIANT = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  withdrawn: 'muted',
} as const;

/** What partners have sent for review, oldest waiting first, with a side-by-side look at each. */
export function RequestsPanel() {
  const t = useTranslations('partners.requests');
  const locale = useLocale() as Locale;
  const id = useId();
  const [status, setStatus] = useState<string>('pending');
  const [kind, setKind] = useState<string>(ALL);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [open, setOpen] = useState<string | null>(null);
  const cursor = cursors[cursors.length - 1];
  const params = {
    limit: 10,
    ...(status === ALL ? {} : { status: status as (typeof STATUSES)[number] }),
    ...(kind === ALL ? {} : { kind: kind as (typeof KINDS)[number] }),
    ...(cursor ? { cursor } : {}),
  };
  const list = useListPartnerRequests(params, { query: { placeholderData: keepPreviousData } });
  const page = list.data?.data;
  const when = dateTime(locale);
  const restart = () => setCursors([undefined]);

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-4">
      <h2 id={`${id}-h`} className="sr-only">
        {t('title')}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-status`}>{t('filters.status')}</Label>
          <Select value={status} onValueChange={(v) => (setStatus(v), restart())}>
            <SelectTrigger id={`${id}-status`} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-kind`}>{t('filters.kind')}</Label>
          <Select value={kind} onValueChange={(v) => (setKind(v), restart())}>
            <SelectTrigger id={`${id}-kind`} className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`kind.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {list.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : list.isError ? (
        <EmptyState
          title={t('failed')}
          icon={<Inbox aria-hidden="true" />}
          action={<Button onClick={() => void list.refetch()}>{t('retry')}</Button>}
        />
      ) : page && page.items.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyHint')} icon={<Inbox aria-hidden="true" />} />
      ) : (
        <>
          <ul className="divide-y rounded-lg border" aria-label={t('title')}>
            {page?.items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">
                    <bdi>{row.hospitalName}</bdi>
                    {row.packageName ? (
                      <span className="text-muted-foreground">
                        {' · '}
                        <bdi>{row.packageName}</bdi>
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(`kind.${row.kind}`)} · {when.format(new Date(row.submittedAt))}
                    {row.submittedByName ? ` · ${row.submittedByName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[row.status]}>{t(`status.${row.status}`)}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setOpen(row.id)}>
                    {row.status === 'pending' ? t('review') : t('view')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t('total', { count: page?.total ?? 0 })}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={cursors.length === 1}
                onClick={() => setCursors((c) => c.slice(0, -1))}
              >
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
      {open ? <RequestDialog id={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

type RejectValues = z.input<typeof rejectRequestSchema>;

function RequestDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('partners.requests');
  const actions = useTranslations('partners.actions');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const detail = useGetPartnerRequest(id);
  const approve = useApprovePartnerRequest();
  const reject = useRejectPartnerRequest();
  const [rejecting, setRejecting] = useState(false);
  const form = useForm<RejectValues>({
    resolver: zodResolver(rejectRequestSchema),
    defaultValues: { reason: '' },
  });
  const data = detail.data?.data;
  // The list, and this request's own detail: a request decided here must not look undecided when it is opened again.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListPartnerRequestsQueryKey().slice(0, 1) }),
      queryClient.invalidateQueries({ queryKey: getGetPartnerRequestQueryKey(id) }),
    ]);
  const currency = (() => {
    const row = data?.diff.find((d) => d.field === 'currency');
    return typeof row?.proposed === 'string' ? row.proposed : null;
  })();
  const when = dateTime(locale);

  const decide = async (run: () => Promise<unknown>, done: string) => {
    try {
      await run();
      toast.success(done);
      await refresh();
      onClose();
    } catch (error) {
      const problem = fieldProblems(error)[0];
      form.setError('root', { message: problem?.message ?? t('decideFailed') });
      toast.error(problem?.message ?? t('decideFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={actions('close')} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {data ? `${t(`kind.${data.kind}`)} — ${data.hospitalName}` : t('title')}
          </DialogTitle>
        </DialogHeader>
        {detail.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : detail.isError || !data ? (
          <EmptyState title={t('failed')} icon={<Inbox aria-hidden="true" />} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {when.format(new Date(data.submittedAt))}
              {data.submittedByName ? ` · ${data.submittedByName}` : ''}
              {data.packageName ? ` · ${data.packageName}` : ''}
            </p>
            {data.note ? (
              <p className="rounded-md border bg-muted p-3 text-sm">
                <span className="font-medium">{t('note')}: </span>
                <bdi>{data.note}</bdi>
              </p>
            ) : null}
            {data.diff.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('diff.caption')}</caption>
                  <thead>
                    <tr className="border-b text-start text-muted-foreground">
                      <th scope="col" className="p-2 text-start font-medium">{t('diff.field')}</th>
                      {data.kind === 'hospital_onboarding' ? null : (
                        <th scope="col" className="p-2 text-start font-medium">{t('diff.current')}</th>
                      )}
                      <th scope="col" className="p-2 text-start font-medium">{t('diff.proposed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.diff.map((row) => (
                      <tr key={row.field} className="border-b align-top">
                        <th scope="row" className="p-2 text-start font-medium">
                          {t(`fields.${row.field}` as never)}
                        </th>
                        {data.kind === 'hospital_onboarding' ? null : (
                          <td className="p-2">
                            <bdi>{diffText(row.field, row.live, currency, locale, t('diff.empty'))}</bdi>
                            {row.stale ? (
                              <Badge variant="warning" className="ms-2">
                                {t('diff.stale')}
                              </Badge>
                            ) : null}
                          </td>
                        )}
                        <td className="p-2 font-medium">
                          <bdi>{diffText(row.field, row.proposed, currency, locale, t('diff.empty'))}</bdi>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('diff.none')}</p>
            )}
            {data.decisionReason ? (
              <p className="text-sm">
                <span className="font-medium">{t('reason')}: </span>
                <bdi>{data.decisionReason}</bdi>
                {data.decidedByName ? ` — ${data.decidedByName}` : ''}
              </p>
            ) : null}
            {form.formState.errors.root?.message ? (
              <p role="alert" className="text-sm text-destructive">
                {form.formState.errors.root.message}
              </p>
            ) : null}
            {data.status === 'pending' && rejecting ? (
              <form
                noValidate
                className="space-y-3"
                onSubmit={form.handleSubmit((values) =>
                  decide(() => reject.mutateAsync({ id, data: values }), t('rejected')),
                )}
              >
                <FormTextarea
                  control={form.control}
                  name="reason"
                  label={t('rejectReason')}
                  description={t('rejectReasonHint')}
                  rows={3}
                  required
                />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
                    {actions('cancel')}
                  </Button>
                  <Button type="submit" variant="destructive" loading={form.formState.isSubmitting}>
                    {t('reject')}
                  </Button>
                </DialogFooter>
              </form>
            ) : data.status === 'pending' ? (
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejecting(true)}>
                  {t('reject')}
                </Button>
                <Button
                  loading={approve.isPending}
                  onClick={() => void decide(() => approve.mutateAsync({ id }), t('approved'))}
                >
                  {t('approve')}
                </Button>
              </DialogFooter>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

