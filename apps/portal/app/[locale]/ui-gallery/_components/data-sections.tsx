'use client';

import {
  Button,
  DataTable,
  FileUploader,
  FormCheckbox,
  FormCombobox,
  FormCurrencyInput,
  FormDatePicker,
  FormInput,
  FormPhoneInput,
  FormSelect,
  FormSwitch,
  FormTextarea,
  StatusBadge,
  intlLocale,
  toast,
  type DataTableLabels,
  type SignS3Request,
} from '@medtravel/ui';
import { CASE_STAGES, type CaseStage, type Locale } from '@medtravel/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { datePickerLabels } from './date-labels';
import { Section } from './section';

interface CaseRow {
  id: string;
  caseNo: string;
  patient: string;
  country: string;
  stage: CaseStage;
  updated: string;
}

const PATIENTS = [
  'Asha Verma',
  'Omar Al-Farsi',
  'محمد علي',
  'Elena Petrova',
  'John Mwangi',
  'فاطمة الزهراء',
  'Amina Yusuf',
  'Chen Wei',
];
const COUNTRIES = ['Oman', 'UAE', 'Kenya', 'Iraq', 'Nigeria', 'Bangladesh', 'Russia', 'Yemen'];

/** Deterministic fake cases, so the gallery and its tests always show the same data. */
const makeRows = (count: number): CaseRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `c${i + 1}`,
    caseNo: `CASE-2026-${String(i + 1).padStart(6, '0')}`,
    patient: PATIENTS[i % PATIENTS.length] ?? '',
    country: COUNTRIES[(i * 3) % COUNTRIES.length] ?? '',
    stage: CASE_STAGES[i % CASE_STAGES.length] ?? 'enquiry',
    updated: new Date(Date.UTC(2026, 0, 1 + (i % 120))).toISOString(),
  }));

const ALL_ROWS = makeRows(120);
const MANY_ROWS = makeRows(5000);

/** Plays the part of the API: filter, sort and slice, so the table's server-side props are exercised. */
function queryRows(
  rows: CaseRow[],
  search: string,
  sorting: SortingState,
  pageIndex: number,
  pageSize: number,
) {
  const needle = search.trim().toLowerCase();
  let result = needle
    ? rows.filter((r) => `${r.caseNo} ${r.patient} ${r.country}`.toLowerCase().includes(needle))
    : rows;
  const sort = sorting[0];
  if (sort) {
    const key = sort.id as keyof CaseRow;
    result = [...result].sort(
      (a, b) => String(a[key]).localeCompare(String(b[key])) * (sort.desc ? -1 : 1),
    );
  }
  return {
    total: result.length,
    page: result.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
  };
}

export function DataSections({ locale }: { locale: Locale }) {
  const t = useTranslations('gallery');
  const stages = useTranslations('stages');

  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [selection, setSelection] = useState<RowSelectionState>({});
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeZone: 'UTC' }),
    [locale],
  );

  const { total, page } = useMemo(
    () => queryRows(ALL_ROWS, search, sorting, pagination.pageIndex, pagination.pageSize),
    [search, sorting, pagination],
  );

  const columns = useMemo<ColumnDef<CaseRow, never>[]>(
    () => [
      { accessorKey: 'caseNo', header: t('table.caseNo'), meta: { label: t('table.caseNo') } },
      {
        accessorKey: 'patient',
        header: t('table.patient'),
        meta: { label: t('table.patient') },
        cell: ({ row }) => <bdi>{row.original.patient}</bdi>,
      },
      { accessorKey: 'country', header: t('table.country'), meta: { label: t('table.country') } },
      {
        accessorKey: 'stage',
        header: t('table.stage'),
        meta: { label: t('table.stage'), csvValue: ((row: CaseRow) => stages(row.stage)) as never },
        cell: ({ row }) => (
          <StatusBadge status={row.original.stage} label={stages(row.original.stage)} />
        ),
      },
      {
        accessorKey: 'updated',
        header: t('table.updated'),
        meta: { label: t('table.updated') },
        cell: ({ row }) => dateFormat.format(new Date(row.original.updated)),
      },
    ],
    [t, stages, dateFormat],
  );

  const labels: DataTableLabels = {
    caption: t('table.caption'),
    searchPlaceholder: t('table.search'),
    columns: t('table.columns'),
    exportCsv: t('table.export'),
    selectAll: t('table.selectAll'),
    selectRow: (name) => t('table.selectRow', { name }),
    previous: t('table.previous'),
    next: t('table.next'),
    rowsPerPage: t('table.rowsPerPage'),
    pageOf: (p, pages) => t('table.pageOf', { page: p, pages }),
    total: (n) => t('table.total', { count: n }),
    selected: (n) => t('table.selected', { count: n }),
    loading: t('table.loading'),
    emptyTitle: t('table.emptyTitle'),
    emptyDescription: t('table.emptyDescription'),
    errorTitle: t('table.errorTitle'),
    retry: t('error.retry'),
  };

  return (
    <>
      <Section
        id="data-table"
        title={t('sections.dataTable')}
        description={t('descriptions.dataTable')}
      >
        <div className="space-y-8">
          <DataTable
            columns={columns}
            data={page}
            getRowId={(row) => row.id}
            getRowLabel={(row) => row.patient}
            labels={labels}
            search={{
              value: search,
              onChange: (value) => {
                setSearch(value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              },
            }}
            sorting={{ value: sorting, onChange: setSorting }}
            pagination={{ ...pagination, total, onChange: setPagination }}
            selection={{ value: selection, onChange: setSelection }}
            exportFileName="cases"
          />
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t('table.virtualTitle')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('table.virtualHint', { count: MANY_ROWS.length })}
            </p>
            <DataTable
              columns={columns}
              data={MANY_ROWS}
              getRowId={(row) => row.id}
              getRowLabel={(row) => row.patient}
              labels={{ ...labels, caption: t('table.virtualCaption') }}
              virtualize={{ height: 320, rowHeight: 52 }}
            />
          </div>
        </div>
      </Section>

      <FormDemo locale={locale} />
      <UploaderDemo locale={locale} />
    </>
  );
}

function FormDemo({ locale }: { locale: Locale }) {
  const t = useTranslations('gallery');
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t('form.errors.name')),
        email: z.string().email(t('form.errors.email')),
        phone: z.string().min(8, t('form.errors.phone')),
        city: z.string({ error: t('form.errors.city') }).min(1, t('form.errors.city')),
        language: z.string().min(1, t('form.errors.language')),
        arrival: z.iso.date({ error: t('form.errors.arrival') }),
        budget: z
          .number({ error: t('form.errors.budget') })
          .int()
          .min(100, t('form.errors.budget')),
        notes: z.string().max(200, t('form.errors.notes')).optional(),
        consent: z.literal(true, { error: t('form.errors.consent') }),
        urgent: z.boolean(),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      city: '',
      language: '',
      notes: '',
      consent: false as never,
      urgent: false,
    },
  });
  const [submitted, setSubmitted] = useState<string | null>(null);

  const cities = ['delhi', 'mumbai', 'chennai', 'bengaluru'].map((value) => ({
    value,
    label: t(`cities.${value}`),
  }));

  return (
    <Section
      id="form-fields"
      title={t('sections.formFields')}
      description={t('descriptions.formFields')}
    >
      <form
        noValidate
        className="grid max-w-2xl gap-4 sm:grid-cols-2"
        onSubmit={form.handleSubmit((values) => {
          setSubmitted(JSON.stringify(values, null, 2));
          toast.success(t('form.saved'));
        })}
      >
        <FormInput
          control={form.control}
          name="name"
          label={t('form.name')}
          required
          requiredLabel={t('common.required')}
          autoComplete="off"
        />
        <FormInput
          control={form.control}
          name="email"
          label={t('form.email')}
          type="email"
          required
          requiredLabel={t('common.required')}
          description={t('form.emailHint')}
        />
        <FormPhoneInput
          control={form.control}
          name="phone"
          label={t('form.phone')}
          locale={locale}
          required
          requiredLabel={t('common.required')}
          labels={{
            country: t('phone.country'),
            searchCountry: t('phone.search'),
            noCountry: t('phone.none'),
          }}
        />
        <FormCombobox
          control={form.control}
          name="city"
          label={t('form.city')}
          required
          requiredLabel={t('common.required')}
          options={cities}
          placeholder={t('combobox.placeholder')}
          searchPlaceholder={t('combobox.search')}
          emptyLabel={t('combobox.empty')}
        />
        <FormSelect
          control={form.control}
          name="language"
          label={t('form.language')}
          required
          requiredLabel={t('common.required')}
          placeholder={t('select.placeholder')}
          options={[
            { value: 'en', label: t('select.english') },
            { value: 'ar', label: t('select.arabic') },
          ]}
        />
        <FormDatePicker
          control={form.control}
          name="arrival"
          label={t('form.arrival')}
          locale={locale}
          placeholder={t('datePicker.placeholder')}
          labels={datePickerLabels(t)}
          required
          requiredLabel={t('common.required')}
        />
        <FormCurrencyInput
          control={form.control}
          name="budget"
          label={t('form.budget')}
          currency="USD"
          locale={locale}
          required
          requiredLabel={t('common.required')}
          description={t('form.budgetHint')}
        />
        <FormTextarea
          className="sm:col-span-2"
          control={form.control}
          name="notes"
          label={t('form.notes')}
        />
        <FormCheckbox
          className="sm:col-span-2"
          control={form.control}
          name="consent"
          label={t('form.consent')}
        />
        <FormSwitch
          className="sm:col-span-2"
          control={form.control}
          name="urgent"
          label={t('form.urgent')}
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit">{t('form.submit')}</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => form.setError('email', { message: t('form.serverError') })}
          >
            {t('form.simulateServerError')}
          </Button>
        </div>
        {submitted ? (
          <pre
            data-testid="form-result"
            dir="ltr"
            className="overflow-x-auto rounded-lg bg-muted p-3 text-xs sm:col-span-2"
          >
            {submitted}
          </pre>
        ) : null}
      </form>
    </Section>
  );
}

/** Signs S3 requests against the portal's own mock endpoint. In a real app this calls the API's file service. */
const signRequest: SignS3Request = async (request) => {
  const path = request.key.split('/').map(encodeURIComponent).join('/');
  const query = new URLSearchParams();
  if ('uploadId' in request) query.set('uploadId', request.uploadId);
  if ('partNumber' in request) query.set('partNumber', String(request.partNumber));
  let search = query.toString();
  if (request.method === 'POST' && !('uploadId' in request)) search = 'uploads';
  return {
    url: `${window.location.origin}/api/ui-gallery/s3/${path}${search ? `?${search}` : ''}`,
  };
};

function UploaderDemo({ locale }: { locale: Locale }) {
  const t = useTranslations('gallery');
  const [uploaded, setUploaded] = useState<string[]>([]);
  return (
    <Section
      id="file-uploader"
      title={t('sections.fileUploader')}
      description={t('descriptions.fileUploader')}
    >
      <div className="max-w-xl space-y-3">
        <FileUploader
          signRequest={signRequest}
          locale={locale}
          allowedFileTypes={['application/pdf', 'image/*', '.dcm']}
          alwaysMultipart
          // Demo only: the mock endpoint and the tests look uploads up by file name. Real callers keep the
          // default random key.
          generateObjectKey={(file) => `gallery/${crypto.randomUUID()}-${file.name}`}
          onUploaded={(file) => setUploaded((list) => [...list, file.name])}
          labels={{
            dropTitle: t('uploader.dropTitle'),
            dropHint: t('uploader.dropHint'),
            restrictionsHint: t('uploader.restrictions'),
            remove: t('uploader.remove'),
            retry: t('uploader.retry'),
            start: t('uploader.start'),
            cancelAll: t('uploader.cancelAll'),
            uploading: t('uploader.uploading'),
            done: t('uploader.done'),
            failed: t('uploader.failed'),
            queued: t('uploader.queued'),
            progress: (name) => t('uploader.progress', { name }),
            listLabel: t('uploader.list'),
            rejected: {
              empty: (name) => t('uploader.rejected.empty', { name }),
              too_large: (name) => t('uploader.rejected.tooLarge', { name }),
              wrong_type: (name) => t('uploader.rejected.wrongType', { name }),
              too_many: (name) => t('uploader.rejected.tooMany', { name }),
              duplicate: (name) => t('uploader.rejected.duplicate', { name }),
            },
          }}
        />
        <p
          className="text-sm text-muted-foreground"
          aria-live="polite"
          data-testid="uploaded-count"
        >
          {t('uploader.uploadedCount', { count: uploaded.length })}
        </p>
      </div>
    </Section>
  );
}
