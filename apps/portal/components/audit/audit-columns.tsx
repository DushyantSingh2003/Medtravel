import type { AuditPageDtoItemsItem } from '@medtravel/api-client';
import { Button } from '@medtravel/ui';
import type { ColumnDef } from '@tanstack/react-table';

/** Translate a key of the `audit` messages. */
export type AuditT = ((key: string, values?: Record<string, string | number>) => string) & {
  has: (key: string) => boolean;
};

/** The friendly name of an action, or the raw code when it has none. */
export const actionLabel = (t: AuditT, action: string): string => {
  // Message keys cannot contain dots, so `document.viewed` is stored as `document_viewed`.
  const key = `actions.${action.replaceAll('.', '_')}`;
  return t.has(key) ? t(key) : action;
};

export interface AuditColumnOptions {
  t: AuditT;
  formatDate: (iso: string) => string;
  onOpen: (event: AuditPageDtoItemsItem) => void;
}

/** Table columns: time, person, action, record, address. Opening a row shows what was recorded. */
export function auditColumns({
  t,
  formatDate,
  onOpen,
}: AuditColumnOptions): ColumnDef<AuditPageDtoItemsItem, never>[] {
  return [
    {
      id: 'time',
      header: t('columns.time'),
      enableSorting: false,
      meta: { label: t('columns.time'), alwaysVisible: true },
      cell: ({ row }) => (
        <Button
          variant="link"
          className="h-auto justify-start p-0 text-start"
          aria-label={t('viewDetails', { action: actionLabel(t, row.original.action) })}
          onClick={() => onOpen(row.original)}
        >
          <time dateTime={row.original.createdAt}>{formatDate(row.original.createdAt)}</time>
        </Button>
      ),
      // The export writes the ISO time, not the display text.
      accessorFn: (row) => row.createdAt as never,
    },
    {
      id: 'person',
      header: t('columns.person'),
      enableSorting: false,
      meta: { label: t('columns.person') },
      accessorFn: (row) => (row.actorName ?? row.actorEmail ?? t('system')) as never,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <bdi className="font-medium">{row.original.actorName ?? t('system')}</bdi>
          {row.original.actorEmail ? (
            <bdi className="text-sm text-muted-foreground">{row.original.actorEmail}</bdi>
          ) : null}
        </div>
      ),
    },
    {
      id: 'action',
      header: t('columns.action'),
      enableSorting: false,
      meta: { label: t('columns.action') },
      accessorFn: (row) => row.action as never,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{actionLabel(t, row.original.action)}</span>
          <bdi className="font-mono text-xs text-muted-foreground">{row.original.action}</bdi>
        </div>
      ),
    },
    {
      id: 'record',
      header: t('columns.record'),
      enableSorting: false,
      meta: { label: t('columns.record') },
      accessorFn: (row) => `${row.entityType} ${row.entityId}` as never,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <bdi>{row.original.entityType}</bdi>
          <bdi className="font-mono text-xs text-muted-foreground">
            {row.original.entityId.slice(0, 8)}
          </bdi>
        </div>
      ),
    },
    {
      id: 'address',
      header: t('columns.address'),
      enableSorting: false,
      meta: { label: t('columns.address') },
      accessorFn: (row) => (row.ip ?? '') as never,
      cell: ({ row }) => <bdi>{row.original.ip ?? ''}</bdi>,
    },
  ];
}
