'use client';

import {
  useListNotificationEvents,
  useListNotificationLog,
  type ListNotificationLogParams,
} from '@medtravel/api-client';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  OPS_TIME_ZONE,
  dayBoundary,
  type Locale,
} from '@medtravel/contracts';
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
  type DataTableLabels,
} from '@medtravel/ui';
import { keepPreviousData } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { logColumns, type LogT } from './notification-log-columns';
import { SendTestDialog } from './send-test-dialog';

const ALL = 'all';
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const LOG_CHANNELS = NOTIFICATION_CHANNELS.filter((channel) => channel !== 'push');

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

/** Every message the platform sent: filters, a cursor-paged table, and a button that sends a test to yourself. */
export function NotificationLogScreen() {
  const t = useTranslations('notifications.log') as LogT;
  const events = useTranslations('notifications.events');
  const locale = useLocale() as Locale;

  const [personText, setPersonText] = useState('');
  const [eventKey, setEventKey] = useState<string>(ALL);
  const [channel, setChannel] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [testing, setTesting] = useState(false);
  const [visited, setVisited] = useState<{ key: string; stack: (string | undefined)[] }>({
    key: '',
    stack: [undefined],
  });
  const typedPerson = useDebounced(personText);
  const person = typedPerson.length >= 2 ? typedPerson : '';
  const knownEvents = useListNotificationEvents();

  const filters = useMemo<Omit<ListNotificationLogParams, 'cursor' | 'limit'>>(
    () => ({
      ...(person ? { user: person } : {}),
      ...(eventKey === ALL ? {} : { eventKey }),
      ...(channel === ALL ? {} : { channel: channel as ListNotificationLogParams['channel'] }),
      ...(status === ALL ? {} : { status: status as ListNotificationLogParams['status'] }),
      ...(from ? { from: dayBoundary(from, 'start') } : {}),
      ...(to ? { to: dayBoundary(to, 'end') } : {}),
    }),
    [person, eventKey, channel, status, from, to],
  );
  const viewKey = JSON.stringify([filters, pageSize]);
  const cursors = visited.key === viewKey ? visited.stack : [undefined];
  const setCursors = (update: (stack: (string | undefined)[]) => (string | undefined)[]) =>
    setVisited({ key: viewKey, stack: update(cursors) });
  const restart = () => setVisited({ key: viewKey, stack: [undefined] });
  const cursor = cursors.at(-1);

  const list = useListNotificationLog(
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
  const eventName = (key: string) => (events.has(key) ? events(key) : key);
  const columns = useMemo(
    () =>
      logColumns({
        t,
        eventName: (key) => (events.has(key) ? events(key) : key),
        formatDate: (iso) => dateFormat.format(new Date(iso)),
      }),
    [t, events, dateFormat],
  );

  const labels: DataTableLabels = {
    caption: t('table.caption'),
    searchPlaceholder: t('table.search'),
    columns: t('table.columns'),
    exportCsv: '',
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

  const eventKeys = knownEvents.data?.data.events.map((event) => event.key) ?? [];
  const hasFilters =
    personText || eventKey !== ALL || channel !== ALL || status !== ALL || from || to;
  const pageIndex = cursors.length - 1;

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t('filters.event')}
        <Select value={eventKey} onValueChange={setEventKey}>
          <SelectTrigger aria-label={t('filters.event')} className="w-auto min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.allEvents')}</SelectItem>
            {eventKeys.map((key) => (
              <SelectItem key={key} value={key}>
                {eventName(key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('filters.channel')}
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger aria-label={t('filters.channel')} className="w-auto min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.allChannels')}</SelectItem>
            {LOG_CHANNELS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`channels.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('filters.status')}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label={t('filters.status')} className="w-auto min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.allStatuses')}</SelectItem>
            {NOTIFICATION_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`statuses.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            setPersonText('');
            setEventKey(ALL);
            setChannel(ALL);
            setStatus(ALL);
            setFrom('');
            setTo('');
          }}
        >
          {t('filters.clear')}
        </Button>
      ) : null}
      <Button className="ms-auto" onClick={() => setTesting(true)}>
        <Send aria-hidden="true" className="rtl:-scale-x-100" />
        {t('test.button')}
      </Button>
    </div>
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={page?.items ?? []}
        getRowId={(row) => row.id}
        getRowLabel={(row) => eventName(row.eventKey)}
        labels={labels}
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        toolbar={toolbar}
        search={{ value: personText, onChange: setPersonText }}
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
      <SendTestDialog open={testing} onOpenChange={setTesting} />
    </>
  );
}
