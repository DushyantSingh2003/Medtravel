'use client';

import {
  getGetPartnerHospitalQueryKey,
  getListPartnerHospitalsQueryKey,
  usePublishDoctor,
  usePublishHospital,
  usePublishPackage,
  useSetHospitalAgreement,
  useUnpublishDoctor,
  useUnpublishHospital,
  useUnpublishPackage,
  useVerifyAccreditation,
  useGetPartnerHospital,
  useListPartnerHospitals,
  type HospitalDetailDto,
} from '@medtravel/api-client';
import { formatMoney, HOSPITAL_STATUSES, type Locale } from '@medtravel/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormInput,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  toast,
} from '@medtravel/ui';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { fieldProblems } from '../../lib/api-errors';
import { useDebounced } from '../users/use-debounced';
import { dateOnly, dateTime, percentOfBp } from './format';

const ALL = 'all';
const STATUS_VARIANT = {
  draft: 'muted',
  pending_review: 'warning',
  approved: 'info',
  published: 'success',
  unpublished: 'muted',
  suspended: 'destructive',
} as const;

/** Hospitals with their status, referral fee and agreement; open one to verify, set terms and publish. */
export function HospitalsPanel() {
  const t = useTranslations('partners.hospitals');
  const locale = useLocale() as Locale;
  const id = useId();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [open, setOpen] = useState<string | null>(null);
  const q = useDebounced(text);
  const cursor = cursors[cursors.length - 1];
  const list = useListPartnerHospitals(
    {
      limit: 10,
      ...(q.length > 0 ? { q } : {}),
      ...(status === ALL ? {} : { status: status as (typeof HOSPITAL_STATUSES)[number] }),
      ...(cursor ? { cursor } : {}),
    },
    { query: { placeholderData: keepPreviousData } },
  );
  const page = list.data?.data;
  const day = dateOnly(locale);

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-4">
      <h2 id={`${id}-h`} className="sr-only">
        {t('title')}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-q`}>{t('search')}</Label>
          <Input
            id={`${id}-q`}
            type="search"
            value={text}
            onChange={(e) => (setText(e.target.value), setCursors([undefined]))}
            className="w-64"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-status`}>{t('status')}</Label>
          <Select value={status} onValueChange={(v) => (setStatus(v), setCursors([undefined]))}>
            <SelectTrigger id={`${id}-status`} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('all')}</SelectItem>
              {HOSPITAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`statuses.${s}`)}
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
          icon={<Building2 aria-hidden="true" />}
          action={<Button onClick={() => void list.refetch()}>{t('retry')}</Button>}
        />
      ) : page && page.items.length === 0 ? (
        <EmptyState title={t('empty')} icon={<Building2 aria-hidden="true" />} />
      ) : (
        <>
          <ul className="divide-y rounded-lg border" aria-label={t('title')}>
            {page?.items.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">
                    <bdi>{h.name}</bdi>
                    <span className="text-muted-foreground">
                      {' · '}
                      <bdi>{h.cityName}</bdi>
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {h.agreementBp === null ? t('noFee') : t('fee', { fee: percentOfBp(h.agreementBp) })}
                    {h.agreementEndsOn
                      ? ` · ${t('endsOn', { date: day.format(new Date(`${h.agreementEndsOn}T00:00:00Z`)) })}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {h.pendingRequests > 0 ? (
                    <Badge variant="warning">{t('waiting', { count: h.pendingRequests })}</Badge>
                  ) : null}
                  <Badge variant={STATUS_VARIANT[h.status]}>{t(`statuses.${h.status}`)}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setOpen(h.id)}>
                    {t('manage')}
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
      {open ? <HospitalDialog id={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

function HospitalDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('partners.hospitals');
  const actions = useTranslations('partners.actions');
  const detail = useGetPartnerHospital(id);
  const data = detail.data?.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={actions('close')} className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data ? data.name : t('title')}</DialogTitle>
        </DialogHeader>
        {detail.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : detail.isError || !data ? (
          <EmptyState title={t('failed')} icon={<Building2 aria-hidden="true" />} />
        ) : (
          <HospitalDetail data={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function HospitalDetail({ data }: { data: HospitalDetailDto }) {
  const t = useTranslations('partners.hospitals');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const publish = usePublishHospital();
  const unpublish = useUnpublishHospital();
  const publishDoctor = usePublishDoctor();
  const unpublishDoctor = useUnpublishDoctor();
  const publishPackage = usePublishPackage();
  const unpublishPackage = useUnpublishPackage();
  const verify = useVerifyAccreditation();
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetPartnerHospitalQueryKey(data.id) }),
      queryClient.invalidateQueries({ queryKey: getListPartnerHospitalsQueryKey().slice(0, 1) }),
    ]);
  };
  const run = async (action: () => Promise<unknown>, done: string) => {
    setProblem(null);
    try {
      await action();
      toast.success(done);
      await refresh();
    } catch (error) {
      setProblem(fieldProblems(error)[0]?.message ?? t('actionFailed'));
    }
  };
  const when = dateTime(locale);
  const day = dateOnly(locale);
  const isPublished = data.status === 'published';
  const canPublish = data.status === 'approved' || data.status === 'unpublished';

  return (
    <div className="space-y-6">
      {problem ? (
        <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t(`statuses.${data.status}`)}</p>
        {isPublished ? (
          <Button
            variant="outline"
            onClick={() => void run(() => unpublish.mutateAsync({ id: data.id }), t('unpublished'))}
          >
            {t('unpublish')}
          </Button>
        ) : (
          <Button
            disabled={!canPublish}
            onClick={() => void run(() => publish.mutateAsync({ id: data.id }), t('published'))}
          >
            {t('publish')}
          </Button>
        )}
      </div>

      <AgreementForm key={`${data.agreementBp}-${data.agreementEndsOn}-${data.agreementDocumentId}`} data={data} onSaved={refresh} />

      <section aria-labelledby={`acc-${data.id}`} className="space-y-2">
        <h3 id={`acc-${data.id}`} className="font-semibold">
          {t('accreditations.title')}
        </h3>
        {data.accreditations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('accreditations.empty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.accreditations.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 space-y-0.5 text-sm">
                  <p className="font-medium">
                    {t(`accreditations.bodies.${a.body}`)}
                    {a.certificateNo ? <bdi className="ms-2 font-normal">{a.certificateNo}</bdi> : null}
                  </p>
                  <p className="text-muted-foreground">
                    {a.expiresAt
                      ? t('accreditations.expires', { date: day.format(new Date(`${a.expiresAt}T00:00:00Z`)) })
                      : t('accreditations.noExpiry')}
                    {a.expired ? ` · ${t('accreditations.expired')}` : ''}
                    {a.certificateId ? '' : ` · ${t('accreditations.noCertificate')}`}
                  </p>
                  {a.verifiedAt ? (
                    <p className="text-muted-foreground">
                      {t('accreditations.verifiedOn', { date: when.format(new Date(a.verifiedAt)) })}
                      {a.verifiedByName ? ` · ${a.verifiedByName}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={a.verifiedAt ? 'success' : 'muted'}>
                    {a.verifiedAt ? t('accreditations.verified') : t('accreditations.unverified')}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(
                        () => verify.mutateAsync({ id: a.id, data: { verified: !a.verifiedAt } }),
                        a.verifiedAt ? t('accreditations.unverifiedDone') : t('accreditations.verifiedDone'),
                      )
                    }
                  >
                    {a.verifiedAt ? t('accreditations.removeCheck') : t('accreditations.verify')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`doc-${data.id}`} className="space-y-2">
        <h3 id={`doc-${data.id}`} className="font-semibold">
          {t('doctors.title')}
        </h3>
        {data.doctors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('doctors.empty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.doctors.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 p-3">
                <span>
                  <bdi>{d.fullName}</bdi>
                </span>
                <PublishSwitch
                  label={t('doctors.onWebsite', { name: d.fullName })}
                  checked={d.published}
                  disabled={!isPublished && !d.published}
                  onChange={(on) =>
                    void run(
                      () => (on ? publishDoctor : unpublishDoctor).mutateAsync({ id: d.id }),
                      on ? t('doctors.published') : t('doctors.unpublished'),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`pk-${data.id}`} className="space-y-2">
        <h3 id={`pk-${data.id}`} className="font-semibold">
          {t('packages.title')}
        </h3>
        {data.packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('packages.empty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {data.packages.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <bdi className="font-medium">{p.name}</bdi>
                  <span className="ms-2 text-sm text-muted-foreground" dir="ltr">
                    {formatMoney({ amountMinor: p.priceMinor, currency: p.currency }, locale)}
                  </span>
                  {p.active ? null : <Badge variant="muted" className="ms-2">{t('packages.off')}</Badge>}
                </span>
                <PublishSwitch
                  label={t('packages.onWebsite', { name: p.name })}
                  checked={p.published}
                  disabled={(!isPublished || !p.active) && !p.published}
                  onChange={(on) =>
                    void run(
                      () => (on ? publishPackage : unpublishPackage).mutateAsync({ id: p.id }),
                      on ? t('packages.published') : t('packages.unpublished'),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PublishSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return <Switch aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />;
}

const feeText = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, 'A percentage such as 12.5')
  .refine((value) => Number(value) <= 100, 'At most 100');
const agreementFormSchema = z
  .object({ fee: feeText, startsOn: z.iso.date(), endsOn: z.iso.date() })
  .refine((value) => value.endsOn >= value.startsOn, {
    path: ['endsOn'],
    message: 'The agreement cannot end before it starts',
  });
type AgreementValues = z.input<typeof agreementFormSchema>;

function AgreementForm({ data, onSaved }: { data: HospitalDetailDto; onSaved: () => Promise<void> }) {
  const t = useTranslations('partners.hospitals.agreement');
  const save = useSetHospitalAgreement();
  const form = useForm<AgreementValues>({
    resolver: zodResolver(agreementFormSchema),
    defaultValues: {
      fee: data.agreementBp === null ? '' : String(data.agreementBp / 100),
      startsOn: data.agreementStartsOn ?? '',
      endsOn: data.agreementEndsOn ?? '',
    },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        id: data.id,
        data: {
          agreementBp: Math.round(Number(values.fee) * 100),
          startsOn: values.startsOn,
          endsOn: values.endsOn,
          documentId: data.agreementDocumentId,
        },
      });
      toast.success(t('saved'));
      await onSaved();
    } catch (error) {
      const problems = fieldProblems(error);
      if (problems.length === 0) form.setError('root', { message: t('failed') });
      for (const p of problems)
        form.setError(p.path === 'agreementBp' ? 'fee' : (p.path as 'endsOn'), { message: p.message });
    }
  });
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-lg border p-4" aria-labelledby={`ag-${data.id}`}>
      <h3 id={`ag-${data.id}`} className="font-semibold">
        {t('title')}
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormInput control={form.control} name="fee" label={t('fee')} description={t('feeHint')} dir="ltr" required />
        <FormInput control={form.control} name="startsOn" label={t('startsOn')} type="date" dir="ltr" required />
        <FormInput control={form.control} name="endsOn" label={t('endsOn')} type="date" dir="ltr" required />
      </div>
      {form.formState.errors.root?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={form.formState.isSubmitting}>
        {t('save')}
      </Button>
    </form>
  );
}
