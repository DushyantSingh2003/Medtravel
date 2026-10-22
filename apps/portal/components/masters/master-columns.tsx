import type { MasterRowDto } from '@medtravel/api-client';
import type { MasterResource } from '@medtravel/contracts';
import { Badge, Button } from '@medtravel/ui';
import type { ColumnDef } from '@tanstack/react-table';

/** Translate a key of the `masters` messages. */
export type MastersT = (key: string, values?: Record<string, string | number>) => string;

interface Extra {
  /** The row field, which is also the column id and (when `sortable`) the API sort field. */
  id: string;
  header: string;
  sortable?: boolean;
  cell: (row: MasterRowDto, t: MastersT) => React.ReactNode;
}

const plain = (id: keyof MasterRowDto, header: string, sortable = false): Extra => ({
  id,
  header,
  sortable,
  cell: (row) => <bdi>{String(row[id] ?? '')}</bdi>,
});

/** The columns that differ per table, after the name and before the status. */
const EXTRA_COLUMNS: Record<MasterResource, Extra[]> = {
  countries: [
    plain('code', 'code', true),
    plain('dialCode', 'dialCode'),
    plain('region', 'region'),
  ],
  languages: [
    plain('code', 'code', true),
    { id: 'rtl', header: 'rtl', cell: (row, t) => t(row.rtl ? 'direction.rtl' : 'direction.ltr') },
  ],
  currencies: [
    plain('code', 'code', true),
    plain('symbol', 'symbol'),
    plain('minorUnits', 'minorUnits'),
  ],
  specialities: [plain('slug', 'slug', true)],
  treatments: [
    { id: 'speciality', header: 'speciality', cell: (row) => row.speciality?.name ?? '' },
    {
      id: 'typicalStayDays',
      header: 'stay',
      cell: (row, t) =>
        row.typicalStayDays == null ? '' : t('stayDays', { count: row.typicalStayDays }),
    },
    plain('slug', 'slug', true),
  ],
  cities: [plain('countryCode', 'country'), plain('slug', 'slug', true)],
  'document-types': [
    plain('code', 'code', true),
    {
      id: 'kind',
      header: 'kind',
      sortable: true,
      cell: (row, t) => (row.kind ? t(`kinds.${row.kind}`) : ''),
    },
  ],
  'lost-reasons': [plain('code', 'code', true)],
};

export interface ColumnOptions {
  resource: MasterResource;
  t: MastersT;
  /** Opens the editor for a row; absent when the viewer may only read. */
  onOpen?: (row: MasterRowDto) => void;
  formatDate: (iso: string) => string;
  /** The actions menu of a row. */
  actions?: (row: MasterRowDto) => React.ReactNode;
}

/** Table columns for one master table: name (with its Arabic name), the table's own columns, status, updated, actions. */
export function masterColumns({
  resource,
  t,
  onOpen,
  formatDate,
  actions,
}: ColumnOptions): ColumnDef<MasterRowDto, never>[] {
  const hasDates = resource !== 'languages' && resource !== 'currencies';
  const columns: ColumnDef<MasterRowDto, never>[] = [
    {
      id: 'name',
      accessorFn: (row) => row.name as never,
      header: t('columns.name'),
      meta: { label: t('columns.name'), alwaysVisible: true },
      cell: ({ row }) => {
        const arabic = row.original.translations['ar']?.name;
        const name = <bdi>{row.original.name}</bdi>;
        return (
          <div className="flex flex-col">
            {onOpen ? (
              <Button
                variant="link"
                className="h-auto justify-start p-0 text-start font-medium"
                onClick={() => onOpen(row.original)}
              >
                {name}
              </Button>
            ) : (
              <span className="font-medium">{name}</span>
            )}
            {arabic ? (
              <bdi dir="rtl" lang="ar" className="text-sm text-muted-foreground">
                {arabic}
              </bdi>
            ) : null}
          </div>
        );
      },
    },
    ...EXTRA_COLUMNS[resource].map((extra): ColumnDef<MasterRowDto, never> => ({
      id: extra.id,
      header: t(`columns.${extra.header}`),
      enableSorting: extra.sortable ?? false,
      meta: { label: t(`columns.${extra.header}`) },
      cell: ({ row }) => extra.cell(row.original, t),
    })),
    {
      id: 'status',
      header: t('columns.status'),
      enableSorting: false,
      meta: { label: t('columns.status'), csvValue: ((row: MasterRowDto) => state(row)) as never },
      cell: ({ row }) => (
        <Badge variant={state(row.original) === 'active' ? 'success' : 'muted'}>
          {t(`state.${state(row.original)}`)}
        </Badge>
      ),
    },
    ...(hasDates
      ? [
          {
            id: 'updatedAt',
            header: t('columns.updated'),
            meta: { label: t('columns.updated') },
            cell: ({ row }) => (row.original.updatedAt ? formatDate(row.original.updatedAt) : ''),
          } satisfies ColumnDef<MasterRowDto, never>,
        ]
      : []),
  ];
  if (actions) {
    columns.push({
      id: 'actions',
      header: () => <span className="sr-only">{t('actions.edit')}</span>,
      enableSorting: false,
      meta: { noExport: true, alwaysVisible: true, className: 'w-12' },
      cell: ({ row }) => actions(row.original),
    });
  }
  return columns;
}

/** `active`, `inactive` or `deleted`, the one word a row is described by. */
export const state = (row: MasterRowDto): 'active' | 'inactive' | 'deleted' =>
  row.deletedAt ? 'deleted' : row.active ? 'active' : 'inactive';
