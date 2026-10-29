'use client';

import {
  exportAudit,
  useListAudit,
  type AuditPageDtoItemsItem,
  type ListAuditParams,
} from '@medtravel/api-client';
import { OPS_TIME_ZONE, dayBoundary, type Locale } from '@medtravel/contracts';
import {
  Button,
  DataTable,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  intlLocale,
  toast,
  type DataTableLabels,
} from '@medtravel/ui';
import { keepPreviousData } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { AuditDetail } from './audit-detail';
import { auditColumns, type AuditT } from './audit-columns';

const ALL = 'all';
const PAGE_SIZE_OPTIONS = [10, 25, 50];
/** The action filters offered: a few prefixes and the specific events people look for. */
const ACTION_FILTERS = [
  'document.',
  'document.viewed',
  'document.downloaded',
  'patient.',
  'patient.viewed',
  'patient.exported',
  'master_data.',
  'auth.',
  'invitation.',
  'audit.exported',
  'incident.created',
] as const;

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

/** The audit trail: filters, a cursor-paged table, a detail sheet and a CSV export of everything the filters match. */
export function AuditScreen() {
  const t = useTranslations('audit') as AuditT;
  const locale = useLocale() as Locale;

  const [actorText, setActorText] = useState('');
  const [entityTypeText, setEntityTypeText] = useState('');
  const [action, setAction] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pageSize, setPageSize] = useState(25);
  // The cursors visited so far belong to one set of filters; a change of filters or page size starts again.
  const [visited, setVisited] = useState<{ key: string; stack: (string | undefined)[] }>({
    key: '',
    stack: [undefined],
  });
  const [open, setOpen] = useState<AuditPageDtoItemsItem | null>(null);
  const [exporting, setExporting] = useState(false);
  // The API wants at least three characters of a name or email.
  const typedActor = useDebounced(actorText);
  const actor = typedActor.length >= 3 ? typedActor : '';
  const entityType = useDebounced(entityTypeText);

  const filters = useMemo<Omit<ListAuditParams, 'cursor' | 'limit'>>(
    () => ({
      ...(actor ? { actor } : {}),
      ...(entityType ? { entityType } : {}),
      ...(action === ALL ? {} : { action }),
      ...(from ? { from: dayBoundary(from, 'start') } : {}),
      ...(to ? { to: dayBoundary(to, 'end') } : {}),
    }),
    [actor, entityType, action, from, to],
  );
  const viewKey = JSON.stringify([filters, pageSize]);
  const cursors = visited.key === viewKey ? visited.stack : [undefined];
  const setCursors = (update: (stack: (string | undefined)[]) => (string | undefined)[]) =>
    setVisited({ key: viewKey, stack: update(cursors) });
  const restart = () => setVisited({ key: viewKey, stack: [undefined] });

  const cursor = cursors.at(-1);
  const list = useListAudit(
    { ...filters, limit: pageSize, ...(cursor ? { cursor } : {}) },
    { query: { placeholderData: keepPreviousData } },
  );
  const page = list.data?.data;

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: OPS_TIME_ZONE,
      }),
    [locale],
  );
  const formatDate = (iso: string) => dateFormat.format(new Date(iso));
  const columns = useMemo(
    () => auditColumns({ t, formatDate, onOpen: setOpen }),
    // `t` and the formatter change only with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, dateFormat],
  );

  const download = async () => {
    setExporting(true);
    try {
      const response = await exportAudit(filters);
      const blob = new Blob([String(response.data)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'audit-log.csv';
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t('export.done'));
    } catch {
      toast.error(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const labels: DataTableLabels = {
    caption: t('table.caption'),
    searchPlaceholder: t('table.search'),
    columns: t('table.columns'),
    exportCsv: t('export.button'),
    selectAll: t('table.selectAll'),
    selectRow: (name) => t('table.selectRow', { name }),
    previous: t('table.previous'),
    next: t('table.next'),
    rowsPerPage: t('table.rowsPerPage'),
    pageOf: (current, pages) => t('table.pageOf', { page: current, pages }),
    total: (count) => t('table.total', { count }),
    selected: (count) => t('table.selected', { count }),
    loading: t('table.loading'),
    emptyTitle: t('table.emptyTitle'),
    emptyDescription: t('table.emptyDescription'),
    errorTitle: t('table.errorTitle'),
    errorDescription: t('table.errorDescription'),
    retry: t('table.retry'),
  };

  const hasFilters = actorText || entityTypeText || action !== ALL || from || to;
  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t('filters.action')}
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger aria-label={t('filters.action')} className="w-auto min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.allActions')}</SelectItem>
            {ACTION_FILTERS.map((code) => (
              <SelectItem key={code} value={code}>
                {t(`actions.${code.replaceAll('.', '_')}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('filters.entityType')}
        <Input
          value={entityTypeText}
          onChange={(event) => setEntityTypeText(event.target.value)}
          placeholder={t('filters.entityTypePlaceholder')}
          dir="ltr"
          className="w-44"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('filters.from')}
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('filters.to')}
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      {hasFilters ? (
        <Button
          variant="ghost"
          onClick={() => {
            setActorText('');
            setEntityTypeText('');
            setAction(ALL);
            setFrom('');
            setTo('');
          }}
        >
          {t('filters.clear')}
        </Button>
      ) : null}
      <Button
        className="ms-auto"
        variant="outline"
        disabled={exporting}
        onClick={() => void download()}
      >
        <Download aria-hidden="true" />
        {exporting ? t('export.working') : t('export.button')}
      </Button>
    </div>
  );

  const pageIndex = cursors.length - 1;
  return (
    <>
      <DataTable
        columns={columns}
        data={page?.items ?? []}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.action}
        labels={labels}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        toolbar={toolbar}
        search={{ value: actorText, onChange: setActorText }}
        pagination={{
          pageIndex,
          pageSize,
          total: page?.total ?? 0,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          onChange: (next) => {
            if (next.pageSize !== pageSize) {
              setPageSize(next.pageSize);
              restart();
            } else if (next.pageIndex > pageIndex && page?.nextCursor) {
              setCursors((stack) => [...stack, page.nextCursor as string]);
            } else if (next.pageIndex < pageIndex) {
              setCursors((stack) => stack.slice(0, -1));
            }
          },
        }}
      />
      <AuditDetail event={open} t={t} formatDate={formatDate} onClose={() => setOpen(null)} />
    </>
  );
}
