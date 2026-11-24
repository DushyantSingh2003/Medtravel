'use client';

import {
  getGetLeadQueryKey,
  getListLeadsQueryKey,
  useClaimLead,
  useDismissLeadDuplicate,
  useGetLead,
  useMergeLeadPatients,
  type LeadDetailDto,
} from '@medtravel/api-client';
import type { Locale } from '@medtravel/contracts';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  toast,
} from '@medtravel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Inbox } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { fieldProblems } from '../../lib/api-errors';
import { Link } from '../../i18n/navigation';

/** One lead: what was submitted, where it came from, the possible-duplicate banner and what to do about it. */
export function LeadDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('leads');
  const detail = useGetLead(id);
  const data = detail.data?.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('close')} className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data ? data.name : t('detail.title')}</DialogTitle>
        </DialogHeader>
        {detail.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : detail.isError || !data ? (
          <EmptyState title={t('detail.failed')} icon={<Inbox aria-hidden="true" />} />
        ) : (
          <LeadBody data={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LeadBody({ data }: { data: LeadDetailDto }) {
  const t = useTranslations('leads');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const claim = useClaimLead();
  const dismiss = useDismissLeadDuplicate();
  const merge = useMergeLeadPatients();
  const [confirm, setConfirm] = useState<'other' | 'this' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const when = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(data.id) }),
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey().slice(0, 1) }),
    ]);
  const run = async (action: () => Promise<unknown>, done: string) => {
    setProblem(null);
    try {
      await action();
      toast.success(done);
      await refresh();
    } catch (error) {
      setProblem(fieldProblems(error)[0]?.message ?? t('detail.actionFailed'));
    }
  };

  const rows: [string, string | null][] = [
    [t('detail.source'), t(`sources.${data.source}`)],
    [t('detail.phone'), data.phone],
    [t('detail.email'), data.email],
    [t('detail.country'), data.countryCode],
    [t('detail.language'), data.language],
    [t('detail.campaign'), data.utmCampaign],
    [t('detail.utmSource'), data.utmSource],
    [t('detail.utmMedium'), data.utmMedium],
    [t('detail.referrer'), data.referrer],
    [t('detail.agentCode'), data.agentCode],
    [t('detail.received'), when.format(new Date(data.createdAt))],
  ];

  return (
    <div className="space-y-5">
      {problem ? (
        <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          {problem}
        </p>
      ) : null}

      {data.duplicateState === 'possible' ? (
        <div role="region" aria-label={t('banner.title')} className="space-y-3 rounded-lg border border-warning bg-warning/10 p-4" data-slot="duplicate-banner">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle aria-hidden="true" className="size-4" />
            {t('banner.title')}
          </p>
          <p className="text-sm">
            {t('banner.matched', { fields: data.matchedOn.map((f) => t(`matchFields.${f}`)).join(', ') })}
          </p>
          {data.duplicateOf ? (
            <p className="text-sm">
              {t('banner.other', { name: data.duplicateOf.name, count: data.duplicateOf.enquiries })}
            </p>
          ) : data.otherEnquiries.length > 0 ? (
            <p className="text-sm">{t('banner.same', { count: data.otherEnquiries.length })}</p>
          ) : (
            <p className="text-sm">{t('banner.restricted')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {data.duplicateOf ? (
              <>
                <Button size="sm" onClick={() => setConfirm('other')}>
                  {t('banner.mergeOther', { name: data.duplicateOf.name })}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirm('this')}>
                  {t('banner.mergeThis')}
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void run(() => dismiss.mutateAsync({ id: data.id }), t('banner.dismissed'))}
            >
              {t('banner.dismiss')}
            </Button>
          </div>
        </div>
      ) : data.duplicateState === 'merged' ? (
        <Badge variant="success">{t('duplicate.merged')}</Badge>
      ) : data.duplicateState === 'dismissed' ? (
        <Badge variant="muted">{t('duplicate.dismissed')}</Badge>
      ) : null}

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">
                <bdi>{value}</bdi>
              </dd>
            </div>
          ))}
      </dl>

      {data.message ? (
        <section aria-labelledby={`msg-${data.id}`} className="space-y-1">
          <h3 id={`msg-${data.id}`} className="font-semibold">
            {t('detail.message')}
          </h3>
          <p className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm">
            <bdi>{data.message}</bdi>
          </p>
        </section>
      ) : null}

      {data.otherEnquiries.length > 0 ? (
        <section aria-labelledby={`oth-${data.id}`} className="space-y-1">
          <h3 id={`oth-${data.id}`} className="font-semibold">
            {t('detail.otherEnquiries')}
          </h3>
          <ul className="divide-y rounded-lg border text-sm">
            {data.otherEnquiries.map((o) => (
              <li key={o.leadId} className="flex flex-wrap justify-between gap-2 p-2">
                <span dir="ltr">{o.caseNo}</span>
                <span className="text-muted-foreground">
                  {t(`sources.${o.source}`)} · {when.format(new Date(o.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {data.assigned ? null : (
          <Button onClick={() => void run(() => claim.mutateAsync({ id: data.id }), t('detail.claimed'))}>
            {t('detail.claim')}
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href={`/ops/cases/${data.caseNo}`}>{t('detail.openCase')}</Link>
        </Button>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('merge.title')}
        description={t('merge.body')}
        confirmLabel={t('merge.confirm')}
        cancelLabel={t('cancel')}
        closeLabel={t('close')}
        errorLabel={t('detail.actionFailed')}
        onConfirm={async () => {
          if (!confirm) return;
          await merge.mutateAsync({ id: data.id, data: { keep: confirm } });
          toast.success(t('merge.done'));
          setConfirm(null);
          await refresh();
        }}
      />
    </div>
  );
}
