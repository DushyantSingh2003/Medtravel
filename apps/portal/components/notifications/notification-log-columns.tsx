import type { NotificationLogPageDtoItemsItem } from '@medtravel/api-client';
import { Badge } from '@medtravel/ui';
import type { ColumnDef } from '@tanstack/react-table';

/** Translate a key of the `notifications.log` messages. */
export type LogT = ((key: string, values?: Record<string, string | number>) => string) & {
  has: (key: string) => boolean;
};

export const STATUS_TONE = {
  queued: 'muted',
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'destructive',
} as const;

export interface LogColumnOptions {
  t: LogT;
  /** Translate an event key (`notifications.events`). */
  eventName: (key: string) => string;
  formatDate: (iso: string) => string;
}

/** Time, event, channel, status, person, tries and the last error. */
export function logColumns({
  t,
  eventName,
  formatDate,
}: LogColumnOptions): ColumnDef<NotificationLogPageDtoItemsItem, never>[] {
  const channelName = (channel: string) =>
    t.has(`channels.${channel}`) ? t(`channels.${channel}`) : channel;
  const statusName = (status: string) =>
    t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status;
  return [
    {
      id: 'time',
      header: t('columns.time'),
      enableSorting: false,
      meta: { label: t('columns.time'), alwaysVisible: true },
      accessorFn: (row) => row.createdAt as never,
      cell: ({ row }) => (
        <time dateTime={row.original.createdAt}>{formatDate(row.original.createdAt)}</time>
      ),
    },
    {
      id: 'event',
      header: t('columns.event'),
      enableSorting: false,
      meta: { label: t('columns.event') },
      accessorFn: (row) => row.eventKey as never,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{eventName(row.original.eventKey)}</span>
          <bdi className="font-mono text-xs text-muted-foreground">{row.original.eventKey}</bdi>
        </div>
      ),
    },
    {
      id: 'channel',
      header: t('columns.channel'),
      enableSorting: false,
      meta: { label: t('columns.channel') },
      accessorFn: (row) => channelName(row.channel) as never,
    },
    {
      id: 'status',
      header: t('columns.status'),
      enableSorting: false,
      meta: { label: t('columns.status') },
      accessorFn: (row) => statusName(row.status) as never,
      cell: ({ row }) => (
        <Badge variant={STATUS_TONE[row.original.status as keyof typeof STATUS_TONE] ?? 'muted'}>
          {statusName(row.original.status)}
        </Badge>
      ),
    },
    {
      id: 'person',
      header: t('columns.person'),
      enableSorting: false,
      meta: { label: t('columns.person') },
      accessorFn: (row) => (row.userName ?? row.userEmail ?? '') as never,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <bdi className="font-medium">{row.original.userName}</bdi>
          {row.original.userEmail ? (
            <bdi className="text-sm text-muted-foreground">{row.original.userEmail}</bdi>
          ) : null}
        </div>
      ),
    },
    {
      id: 'attempts',
      header: t('columns.attempts'),
      enableSorting: false,
      meta: { label: t('columns.attempts') },
      accessorFn: (row) => row.attempts as never,
    },
    {
      id: 'detail',
      header: t('columns.detail'),
      enableSorting: false,
      meta: { label: t('columns.detail') },
      accessorFn: (row) => (row.lastError ?? '') as never,
      cell: ({ row }) => (
        <bdi className="text-sm text-muted-foreground">
          {row.original.lastError ?? t('noError')}
        </bdi>
      ),
    },
  ];
}
