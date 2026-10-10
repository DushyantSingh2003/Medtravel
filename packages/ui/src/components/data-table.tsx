'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Search,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { downloadCsv, toCsv } from '../lib/csv';
import { Button } from './button';
import { Checkbox } from './checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { EmptyState, ErrorState } from './empty-state';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Skeleton } from './skeleton';

/** Column metadata understood by the table; set it on `ColumnDef.meta`. */
export interface DataTableColumnMeta {
  /** Plain-text header used in the column menu and the CSV export when `header` is not a string. */
  label?: string;
  /** Value written to the CSV for this column; defaults to the cell's accessor value. */
  csvValue?: (row: never) => unknown;
  /** Excluded from the CSV (action columns). */
  noExport?: boolean;
  /** Cannot be hidden from the column menu. */
  alwaysVisible?: boolean;
  /** Extra classes for header and body cells, e.g. a fixed width. */
  className?: string;
}

export interface DataTableLabels {
  /** Accessible name and caption of the table. */
  caption: string;
  searchPlaceholder: string;
  columns: string;
  exportCsv: string;
  selectAll: string;
  /** Name of one row's checkbox, e.g. "Select Priya Sharma". Receives the text from `getRowLabel`. */
  selectRow: (rowName: string) => string;
  previous: string;
  next: string;
  rowsPerPage: string;
  /** e.g. "Page 2 of 9". */
  pageOf: (page: number, pages: number) => string;
  /** e.g. "86 results". */
  total: (total: number) => string;
  /** e.g. "3 selected". */
  selected: (count: number) => string;
  /** Read by screen readers while the skeleton rows are shown. */
  loading: string;
  emptyTitle: string;
  emptyDescription?: string;
  errorTitle: string;
  errorDescription?: string;
  retry: string;
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, never>[];
  data: TData[];
  getRowId: (row: TData) => string;
  /** Plain-text name of a row for its selection checkbox; defaults to the row id. */
  getRowLabel?: (row: TData) => string;
  labels: DataTableLabels;
  /** Server-side pagination. `total` is the number of rows across all pages. */
  pagination?: {
    pageIndex: number;
    pageSize: number;
    total: number;
    pageSizeOptions?: number[];
    onChange: (next: { pageIndex: number; pageSize: number }) => void;
  };
  /** Server-side sorting: the table reports the sort, the caller refetches. */
  sorting?: { value: SortingState; onChange: (next: SortingState) => void };
  /** Which columns are hidden. Pass it to remember the choice per user; omit for internal state. */
  columnVisibility?: { value: VisibilityState; onChange: (next: VisibilityState) => void };
  /** Server-side search box. Typing returns to the first page. */
  search?: { value: string; onChange: (next: string) => void };
  selection?: { value: RowSelectionState; onChange: (next: RowSelectionState) => void };
  /** Renders only the rows in view; use for large pages. Needs a fixed height for the scroll area. */
  virtualize?: { height: number; rowHeight: number };
  /** File name (without extension) for the CSV export of the rows on this page; omit to hide the button. */
  exportFileName?: string;
  loading?: boolean;
  /** When true shows the error state instead of rows. */
  error?: boolean;
  onRetry?: () => void;
  /** Extra controls rendered in the toolbar (filters, bulk actions). */
  toolbar?: ReactNode;
  className?: string;
}

const metaOf = (column: { columnDef: { meta?: unknown } }): DataTableColumnMeta =>
  (column.columnDef.meta ?? {}) as DataTableColumnMeta;

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  getRowLabel,
  labels,
  pagination,
  sorting,
  search,
  columnVisibility: controlledVisibility,
  selection,
  virtualize,
  exportFileName,
  loading,
  error,
  onRetry,
  toolbar,
  className,
}: DataTableProps<TData>) {
  const [internalVisibility, setInternalVisibility] = useState<VisibilityState>({});
  const columnVisibility = controlledVisibility?.value ?? internalVisibility;
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectionColumn: ColumnDef<TData, never> | null = selection
    ? {
        id: '__select',
        meta: {
          noExport: true,
          alwaysVisible: true,
          className: 'w-10',
        } satisfies DataTableColumnMeta,
        header: ({ table }) => (
          <Checkbox
            aria-label={labels.selectAll}
            checked={
              table.getIsAllRowsSelected()
                ? true
                : table.getIsSomeRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(checked) => table.toggleAllRowsSelected(checked === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={labels.selectRow(getRowLabel ? getRowLabel(row.original) : row.id)}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked === true)}
          />
        ),
      }
    : null;

  const table = useReactTable<TData>({
    data,
    columns: selectionColumn ? [selectionColumn, ...columns] : columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: Boolean(selection),
    enableSortingRemoval: true,
    // The server sorts by one column; shift-click must not build a multi-column sort it cannot honour.
    enableMultiSort: false,
    sortDescFirst: false,
    state: {
      columnVisibility,
      sorting: sorting?.value ?? [],
      rowSelection: selection?.value ?? {},
    },
    onColumnVisibilityChange: ((updater) => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater;
      if (controlledVisibility) controlledVisibility.onChange(next);
      else setInternalVisibility(next);
    }) as OnChangeFn<VisibilityState>,
    onSortingChange: ((updater) => {
      if (!sorting) return;
      sorting.onChange(typeof updater === 'function' ? updater(sorting.value) : updater);
      firstPage();
    }) as OnChangeFn<SortingState>,
    onRowSelectionChange: ((updater) => {
      if (!selection) return;
      selection.onChange(typeof updater === 'function' ? updater(selection.value) : updater);
    }) as OnChangeFn<RowSelectionState>,
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => virtualize?.rowHeight ?? 48,
    overscan: 8,
    // Rows can wrap (long names, Arabic at 360 px), so real heights are measured, not assumed.
    measureElement: (element) => element.getBoundingClientRect().height,
  });
  const virtualItems = virtualize ? virtualizer.getVirtualItems() : [];
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;
  const visibleRows = virtualize
    ? virtualItems
        .map((item) => rows[item.index])
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
    : rows;

  const pages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;
  const selectedCount = Object.values(selection?.value ?? {}).filter(Boolean).length;
  const columnCount = Math.max(1, table.getVisibleLeafColumns().length);
  const pageIndex = pagination?.pageIndex ?? 0;

  function firstPage() {
    if (pagination && pagination.pageIndex !== 0)
      pagination.onChange({ pageIndex: 0, pageSize: pagination.pageSize });
  }

  // If the total shrinks (a filter, a deletion elsewhere) the current page may no longer exist.
  useEffect(() => {
    if (pagination && !loading && pageIndex > pages - 1) {
      pagination.onChange({ pageIndex: pages - 1, pageSize: pagination.pageSize });
    }
  }, [pagination, loading, pageIndex, pages]);

  function exportCsv() {
    const exportable = table
      .getVisibleLeafColumns()
      .filter((column) => !metaOf(column).noExport && column.id !== '__select');
    const header = exportable.map((column) => {
      const def = column.columnDef.header;
      return metaOf(column).label ?? (typeof def === 'string' ? def : column.id);
    });
    const body = table.getRowModel().rows.map((row) =>
      exportable.map((column) => {
        const custom = metaOf(column).csvValue;
        return custom ? custom(row.original as never) : row.getValue(column.id);
      }),
    );
    downloadCsv(exportFileName ?? 'export', toCsv(header, body));
  }

  return (
    <div data-slot="data-table" className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {search ? (
          <div className="relative min-w-0 flex-1 basis-56">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search.value}
              onChange={(event) => {
                search.onChange(event.target.value);
                firstPage();
              }}
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchPlaceholder}
              className="ps-9"
            />
          </div>
        ) : null}
        {toolbar}
        <div className="ms-auto flex items-center gap-2">
          {selection && selectedCount > 0 ? (
            <span className="text-sm text-muted-foreground">{labels.selected(selectedCount)}</span>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 aria-hidden="true" />
                {labels.columns}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{labels.columns}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((column) => !metaOf(column).alwaysVisible)
                .map((column) => {
                  const def = column.columnDef.header;
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(visible) => column.toggleVisibility(visible === true)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {metaOf(column).label ?? (typeof def === 'string' ? def : column.id)}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
          {exportFileName ? (
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={rows.length === 0 || loading}
            >
              <Download aria-hidden="true" />
              {labels.exportCsv}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <ErrorState
          headingLevel={null}
          title={labels.errorTitle}
          description={labels.errorDescription}
          retryLabel={labels.retry}
          onRetry={onRetry}
        />
      ) : (
        <div
          ref={scrollRef}
          role="region"
          aria-label={labels.caption}
          aria-busy={loading || undefined}
          // Keyboard users can scroll a region that overflows.
          tabIndex={0}
          style={virtualize ? { height: virtualize.height } : undefined}
          className={cn('overflow-auto rounded-xl border', virtualize && 'overscroll-contain')}
        >
          <table
            className="w-full caption-bottom text-sm"
            aria-rowcount={virtualize ? rows.length + 1 : undefined}
          >
            <caption className="sr-only">{labels.caption}</caption>
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} aria-rowindex={virtualize ? 1 : undefined} className="border-b">
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    const canSort = header.column.getCanSort() && Boolean(sorting);
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : canSort
                                ? 'none'
                                : undefined
                        }
                        className={cn(
                          'h-11 px-3 text-start align-middle font-medium whitespace-nowrap text-muted-foreground',
                          metaOf(header.column).className,
                        )}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="-ms-2 inline-flex items-center gap-1 rounded-sm px-2 py-1 hover:bg-accent hover:text-accent-foreground"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? (
                              <ArrowUp className="size-3.5" aria-hidden="true" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b last:border-0">
                    <td colSpan={columnCount} className="p-3">
                      {index === 0 ? <span className="sr-only">{labels.loading}</span> : null}
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="p-4">
                    <EmptyState
                      headingLevel={null}
                      title={labels.emptyTitle}
                      description={labels.emptyDescription}
                      className="border-0"
                    />
                  </td>
                </tr>
              ) : (
                <>
                  {paddingTop > 0 ? (
                    <tr aria-hidden="true">
                      <td colSpan={columnCount} style={{ height: paddingTop, padding: 0 }} />
                    </tr>
                  ) : null}
                  {visibleRows.map((row) => (
                    <tr
                      key={row.id}
                      ref={virtualize ? virtualizer.measureElement : undefined}
                      data-index={row.index}
                      aria-rowindex={virtualize ? row.index + 2 : undefined}
                      data-state={row.getIsSelected() ? 'selected' : undefined}
                      style={virtualize ? { height: virtualize.rowHeight } : undefined}
                      className="border-b transition-colors last:border-0 hover:bg-muted/50 data-[state=selected]:bg-accent"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn('px-3 py-2 align-middle', metaOf(cell.column).className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {paddingBottom > 0 ? (
                    <tr aria-hidden="true">
                      <td colSpan={columnCount} style={{ height: paddingBottom, padding: 0 }} />
                    </tr>
                  ) : null}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">{labels.total(pagination.total)}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-muted-foreground">
              <span>{labels.rowsPerPage}</span>
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(next) =>
                  pagination.onChange({ pageIndex: 0, pageSize: Number(next) })
                }
              >
                <SelectTrigger className="h-8 w-20" aria-label={labels.rowsPerPage}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(pagination.pageSizeOptions ?? [10, 20, 50]).map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <span aria-live="polite">{labels.pageOf(pagination.pageIndex + 1, pages)}</span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={labels.previous}
                disabled={pagination.pageIndex <= 0}
                onClick={() =>
                  pagination.onChange({
                    pageIndex: pagination.pageIndex - 1,
                    pageSize: pagination.pageSize,
                  })
                }
              >
                <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={labels.next}
                disabled={pagination.pageIndex >= pages - 1}
                onClick={() =>
                  pagination.onChange({
                    pageIndex: pagination.pageIndex + 1,
                    pageSize: pagination.pageSize,
                  })
                }
              >
                <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
