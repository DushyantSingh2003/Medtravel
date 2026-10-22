'use client';

import {
  getListMastersQueryKey,
  useDeleteMaster,
  useListMasters,
  useRestoreMaster,
  useUpdateMaster,
  type ListMastersParams,
  type MasterRowDto,
} from '@medtravel/api-client';
import {
  DOCUMENT_KINDS,
  MASTER_DEFINITIONS,
  type Locale,
  type MasterResource,
} from '@medtravel/contracts';
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  intlLocale,
  toast,
  type DataTableLabels,
} from '@medtravel/ui';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { fieldProblems } from './master-api-errors';
import { masterColumns, state, type MastersT } from './master-columns';
import { MasterForm } from './master-form';
import { useMasterOptions } from './use-master-options';

interface MasterScreenProps {
  resource: MasterResource;
  /** Whether the viewer may add, change and delete; otherwise the list is read-only. */
  canManage: boolean;
}

const ALL = 'all';
// Capped at 50 rows: longer pages would have to be virtualised (CLAUDE.md), and nobody reads 100 rows of master data.
const PAGE_SIZE_OPTIONS = [10, 25, 50];

/** The list, filters and editors of one master table. */
export function MasterScreen({ resource, canManage }: MasterScreenProps) {
  const t = useTranslations('masters') as MastersT;
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const definition = MASTER_DEFINITIONS[resource];
  const thing = t(`resources.${resource}.singular`);

  // ---- what the list shows ------------------------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [showDeleted, setShowDeleted] = useState(false);
  const [specialityId, setSpecialityId] = useState<string>(ALL);
  const [countryCode, setCountryCode] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [pageSize, setPageSize] = useState(25);
  // Cursor paging: the cursor that starts each page visited so far; the last one is the current page.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const sort = sorting[0];
  const params: ListMastersParams = {
    limit: pageSize,
    ...(cursors.at(-1) ? { cursor: cursors.at(-1) as string } : {}),
    ...(debounced ? { q: debounced } : {}),
    ...(status === ALL ? {} : { active: status === 'active' ? 'true' : 'false' }),
    ...(showDeleted ? { deleted: 'true' as const } : {}),
    ...(sort ? { sort: `${sort.desc ? '-' : ''}${sort.id}` } : {}),
    ...(resource === 'treatments' && specialityId !== ALL ? { specialityId } : {}),
    ...(resource === 'cities' && countryCode !== ALL ? { countryCode } : {}),
    ...(resource === 'document-types' && kind !== ALL
      ? { kind: kind as (typeof DOCUMENT_KINDS)[number] }
      : {}),
  };
  const list = useListMasters(resource, params, { query: { placeholderData: keepPreviousData } });
  const page = list.data?.data;

  /** Back to the first page whenever the question the list answers changes. */
  const restart = () => setCursors([undefined]);

  // ---- editing ------------------------------------------------------------------------------------------
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MasterRowDto | null>(null);
  const [deleting, setDeleting] = useState<MasterRowDto | null>(null);
  const update = useUpdateMaster();
  const remove = useDeleteMaster();
  const restore = useRestoreMaster();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [getListMastersQueryKey(resource)[0]] });
    await queryClient.invalidateQueries({ queryKey: ['master-options'] });
  };

  /** Show the row that was just saved: clear every filter, go to the first page and put the newest change first. */
  const revealNewest = () => {
    const hasDates = resource !== 'languages' && resource !== 'currencies';
    setSorting([hasDates ? { id: 'updatedAt', desc: true } : { id: 'name', desc: false }]);
    setSearch('');
    setDebounced('');
    setStatus(ALL);
    setShowDeleted(false);
    setSpecialityId(ALL);
    setCountryCode(ALL);
    setKind(ALL);
    restart();
  };

  const saved = async (kindOfChange: 'created' | 'updated', row: MasterRowDto) => {
    toast.success(t(`toast.${kindOfChange}`, { name: row.name }));
    revealNewest();
    await refresh();
  };

  const runAction = async (action: () => Promise<unknown>, done: string, name: string) => {
    try {
      await action();
      toast.success(t(done, { name }));
      await refresh();
    } catch (error) {
      // A conflict says why (for example that a speciality still has treatments); show that rather than a generic line.
      toast.error(fieldProblems(error)[0]?.message ?? t('toast.failed'));
    }
  };

  // ---- table --------------------------------------------------------------------------------------------
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  const columns = useMemo(
    () =>
      masterColumns({
        resource,
        t,
        formatDate: (iso) => dateFormat.format(new Date(iso)),
        ...(canManage ? { onOpen: setEditing } : {}),
        ...(canManage
          ? {
              actions: (row: MasterRowDto) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('actions.menu', { name: row.name })}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {state(row) === 'deleted' ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          void runAction(
                            () => restore.mutateAsync({ resource, id: row.id }),
                            'toast.restored',
                            row.name,
                          )
                        }
                      >
                        {t('actions.restore')}
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem onSelect={() => setEditing(row)}>
                          {t('actions.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            void runAction(
                              () =>
                                update.mutateAsync({
                                  resource,
                                  id: row.id,
                                  data: { active: !row.active },
                                }),
                              'toast.updated',
                              row.name,
                            )
                          }
                        >
                          {t(row.active ? 'actions.deactivate' : 'actions.activate')}
                        </DropdownMenuItem>
                        {definition.softDelete ? (
                          <DropdownMenuItem destructive onSelect={() => setDeleting(row)}>
                            {t('actions.delete')}
                          </DropdownMenuItem>
                        ) : null}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            }
          : {}),
      }),
    // The mutation objects are stable enough for a menu; the handlers read the latest `resource` and `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resource, t, dateFormat, canManage],
  );

  const labels: DataTableLabels = {
    caption: t('table.caption', { name: t(`resources.${resource}.title`) }),
    searchPlaceholder: t('table.search'),
    columns: t('table.columns'),
    exportCsv: t('table.export'),
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
    retry: t('actions.retry'),
  };

  // ---- filters ------------------------------------------------------------------------------------------
  const specialities = useMasterOptions('specialities', resource === 'treatments');
  const countries = useMasterOptions('countries', resource === 'cities');

  const filter = (
    id: string,
    label: string,
    value: string,
    onChange: (next: string) => void,
    allLabel: string,
    options: { value: string; label: string }[],
  ) => (
    <Select
      value={value}
      onValueChange={(next) => {
        onChange(next);
        restart();
      }}
    >
      <SelectTrigger id={id} aria-label={label} className="w-auto min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {filter('status', t('filters.status'), status, setStatus, t('filters.all'), [
        { value: 'active', label: t('filters.active') },
        { value: 'inactive', label: t('filters.inactive') },
      ])}
      {resource === 'treatments'
        ? filter(
            'speciality',
            t('filters.speciality'),
            specialityId,
            setSpecialityId,
            t('filters.allSpecialities'),
            specialities.data ?? [],
          )
        : null}
      {resource === 'cities'
        ? filter(
            'country',
            t('filters.country'),
            countryCode,
            setCountryCode,
            t('filters.allCountries'),
            countries.data ?? [],
          )
        : null}
      {resource === 'document-types'
        ? filter(
            'kind',
            t('filters.kind'),
            kind,
            setKind,
            t('filters.allKinds'),
            DOCUMENT_KINDS.map((value) => ({ value, label: t(`kinds.${value}`) })),
          )
        : null}
      {definition.softDelete ? (
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={showDeleted}
            onCheckedChange={(next) => {
              setShowDeleted(next);
              restart();
            }}
          />
          {t('filters.showDeleted')}
        </label>
      ) : null}
      {canManage ? (
        <Button className="ms-auto" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t('actions.add', { thing })}
        </Button>
      ) : null}
    </div>
  );

  const pageIndex = cursors.length - 1;
  return (
    <>
      {!canManage ? (
        <p className="mb-3 text-sm text-muted-foreground">{t('actions.readOnly')}</p>
      ) : null}
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
        search={{
          value: search,
          onChange: (next) => {
            setSearch(next);
            restart();
          },
        }}
        sorting={{
          value: sorting,
          onChange: (next) => {
            setSorting(next);
            restart();
          },
        }}
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
        exportFileName={resource}
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent
          closeLabel={t('actions.close')}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>{t('dialog.createTitle', { thing })}</DialogTitle>
            <DialogDescription>{t('dialog.createDescription')}</DialogDescription>
          </DialogHeader>
          <MasterForm
            resource={resource}
            onCancel={() => setCreating(false)}
            onSaved={(row) => {
              setCreating(false);
              void saved('created', row);
            }}
          />
        </DialogContent>
      </Dialog>

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent
          side="end"
          closeLabel={t('actions.close')}
          className="overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>{t('dialog.editTitle', { thing })}</SheetTitle>
            <SheetDescription>{t('dialog.editDescription')}</SheetDescription>
          </SheetHeader>
          {editing ? (
            <MasterForm
              key={editing.id}
              resource={resource}
              row={editing}
              onCancel={() => setEditing(null)}
              onSaved={(row) => {
                setEditing(null);
                void saved('updated', row);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('confirm.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('confirm.deleteBody')}
        confirmLabel={t('confirm.deleteConfirm')}
        cancelLabel={t('actions.cancel')}
        closeLabel={t('actions.close')}
        errorLabel={t('confirm.error')}
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync({ resource, id: deleting.id });
          toast.success(t('toast.deleted', { name: deleting.name }));
          await refresh();
        }}
      />
    </>
  );
}
