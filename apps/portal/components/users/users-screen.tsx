'use client';

import {
  useListTeams,
  useListUsers,
  type ListUsersParams,
  type UserPageDtoItemsItem,
} from '@medtravel/api-client';
import type { Locale, Role } from '@medtravel/contracts';
import { ROLES } from '@medtravel/contracts';
import {
  Badge,
  Button,
  DataTable,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  intlLocale,
  type DataTableLabels,
} from '@medtravel/ui';
import { keepPreviousData } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { UserPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Link } from '../../i18n/navigation';
import { InviteDialog } from './invite-dialog';
import { TeamsPanel } from './teams-panel';
import { useDebounced } from './use-debounced';

const ALL = 'all';
const PAGE_SIZE_OPTIONS = [10, 25, 50];
/** Roles that appear on this screen: staff and hospital users. */
const MANAGED = ROLES.filter((r) => !['patient', 'attendant', 'agent'].includes(r));
const STATUSES = ['active', 'invited', 'suspended', 'deactivated'] as const;
const STATUS_VARIANT = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
  deactivated: 'muted',
} as const;

type T = ReturnType<typeof useTranslations>;

/** People and teams: a searchable, filterable list of staff and hospital users, and the teams they belong to. */
export function UsersScreen() {
  const t = useTranslations('users');
  const roles = useTranslations('roles');
  const locale = useLocale() as Locale;
  const [searchText, setSearchText] = useState('');
  const [role, setRole] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [teamId, setTeamId] = useState<string>(ALL);
  const [pageSize, setPageSize] = useState(25);
  const [visited, setVisited] = useState<{ key: string; stack: (string | undefined)[] }>({
    key: '',
    stack: [undefined],
  });
  const [inviting, setInviting] = useState(false);
  const q = useDebounced(searchText);
  const teams = useListTeams();

  const filters = useMemo<Omit<ListUsersParams, 'cursor' | 'limit'>>(
    () => ({
      ...(q.length >= 2 ? { q } : {}),
      ...(role === ALL ? {} : { role: role as Role }),
      ...(status === ALL ? {} : { status: status as (typeof STATUSES)[number] }),
      ...(teamId === ALL ? {} : { teamId }),
    }),
    [q, role, status, teamId],
  );
  const viewKey = JSON.stringify([filters, pageSize]);
  const cursors = visited.key === viewKey ? visited.stack : [undefined];
  const setCursors = (update: (s: (string | undefined)[]) => (string | undefined)[]) =>
    setVisited({ key: viewKey, stack: update(cursors) });
  const cursor = cursors.at(-1);
  const list = useListUsers(
    { ...filters, limit: pageSize, ...(cursor ? { cursor } : {}) },
    { query: { placeholderData: keepPreviousData } },
  );
  const page = list.data?.data;

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const columns = useMemo(
    () =>
      userColumns(
        t,
        (r) => roles(r),
        (iso) => dateFormat.format(new Date(iso)),
      ),
    [t, roles, dateFormat],
  );

  const labels: DataTableLabels = {
    caption: t('table.caption'),
    searchPlaceholder: t('filters.search'),
    columns: t('table.columns'),
    exportCsv: '',
    selectAll: '',
    selectRow: () => '',
    previous: t('table.previous'),
    next: t('table.next'),
    rowsPerPage: t('table.rowsPerPage'),
    pageOf: (current, pages) => `${current} / ${pages}`,
    total: (count) => t('table.total', { count }),
    selected: () => '',
    loading: t('table.loading'),
    emptyTitle: t('table.empty'),
    emptyDescription: t('table.emptyHint'),
    errorTitle: t('table.error'),
    errorDescription: '',
    retry: t('table.retry'),
  };

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        label={t('filters.role')}
        value={role}
        onChange={setRole}
        all={t('filters.allRoles')}
        options={MANAGED.map((r) => ({ value: r, label: roles(r) }))}
      />
      <FilterSelect
        label={t('filters.status')}
        value={status}
        onChange={setStatus}
        all={t('filters.allStatuses')}
        options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
      />
      <FilterSelect
        label={t('filters.team')}
        value={teamId}
        onChange={setTeamId}
        all={t('filters.allTeams')}
        options={(teams.data?.data.items ?? []).map((x) => ({ value: x.id, label: x.name }))}
      />
      <Button className="ms-auto" onClick={() => setInviting(true)}>
        <UserPlus aria-hidden="true" />
        {t('invite.button')}
      </Button>
    </div>
  );

  const pageIndex = cursors.length - 1;
  return (
    <Tabs defaultValue="people">
      <TabsList>
        <TabsTrigger value="people">{t('tabs.people')}</TabsTrigger>
        <TabsTrigger value="teams">{t('tabs.teams')}</TabsTrigger>
      </TabsList>
      <TabsContent value="people" className="mt-4">
        <DataTable
          columns={columns}
          data={page?.items ?? []}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.name}
          labels={labels}
          loading={list.isPending}
          error={list.isError}
          onRetry={() => void list.refetch()}
          toolbar={toolbar}
          search={{ value: searchText, onChange: setSearchText }}
          pagination={{
            pageIndex,
            pageSize,
            total: page?.total ?? 0,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            onChange: (next) => {
              if (next.pageSize !== pageSize) {
                setPageSize(next.pageSize);
                setVisited({ key: viewKey, stack: [undefined] });
              } else if (next.pageIndex > pageIndex && page?.nextCursor)
                setCursors((s) => [...s, page.nextCursor as string]);
              else if (next.pageIndex < pageIndex) setCursors((s) => s.slice(0, -1));
            },
          }}
        />
        <InviteDialog
          open={inviting}
          onOpenChange={setInviting}
          onInvited={() => void list.refetch()}
        />
      </TabsContent>
      <TabsContent value="teams" className="mt-4">
        <TeamsPanel />
      </TabsContent>
    </Tabs>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  all,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  all: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-auto min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{all}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function userColumns(
  t: T,
  roleLabel: (role: string) => string,
  formatDate: (iso: string) => string,
): ColumnDef<UserPageDtoItemsItem, never>[] {
  return [
    {
      id: 'name',
      header: t('columns.name'),
      enableSorting: false,
      meta: { label: t('columns.name'), alwaysVisible: true },
      accessorFn: (row) => row.name as never,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <Link
            href={`/admin/users/${row.original.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            <bdi>{row.original.name}</bdi>
          </Link>
          {row.original.email ? (
            <bdi className="text-sm text-muted-foreground">{row.original.email}</bdi>
          ) : null}
        </div>
      ),
    },
    {
      id: 'role',
      header: t('columns.role'),
      enableSorting: false,
      meta: { label: t('columns.role') },
      accessorFn: (row) => roleLabel(row.role) as never,
    },
    {
      id: 'team',
      header: t('columns.team'),
      enableSorting: false,
      meta: { label: t('columns.team') },
      accessorFn: (row) => (row.teamName ?? t('noTeam')) as never,
    },
    {
      id: 'status',
      header: t('columns.status'),
      enableSorting: false,
      meta: { label: t('columns.status') },
      accessorFn: (row) => row.status as never,
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          <Badge variant={STATUS_VARIANT[row.original.status as keyof typeof STATUS_VARIANT]}>
            {t(`status.${row.original.status}`)}
          </Badge>
          {row.original.onLeave ? <Badge variant="warning">{t('onLeave')}</Badge> : null}
        </span>
      ),
    },
    {
      id: 'twoFactor',
      header: t('columns.twoFactor'),
      enableSorting: false,
      meta: { label: t('columns.twoFactor') },
      accessorFn: (row) => (row.twoFactorEnabled ? t('twoFactorOn') : t('twoFactorOff')) as never,
    },
    {
      id: 'lastLogin',
      header: t('columns.lastLogin'),
      enableSorting: false,
      meta: { label: t('columns.lastLogin') },
      accessorFn: (row) => (row.lastLoginAt ? formatDate(row.lastLoginAt) : t('never')) as never,
    },
  ];
}
