import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableLabels } from './data-table';

interface Row {
  id: string;
  name: string;
  city: string;
}
const rows: Row[] = [
  { id: '1', name: 'Asha', city: 'Delhi' },
  { id: '2', name: '=cmd|calc', city: 'Mumbai, MH' },
  { id: '3', name: 'محمد', city: 'Chennai' },
];
const columns: ColumnDef<Row, never>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'city', header: 'City' },
];
const labels: DataTableLabels = {
  caption: 'People',
  searchPlaceholder: 'Search',
  columns: 'Columns',
  exportCsv: 'Export',
  selectAll: 'Select all',
  selectRow: 'Select row',
  previous: 'Previous',
  next: 'Next',
  rowsPerPage: 'Rows per page',
  pageOf: (p, n) => `Page ${p} of ${n}`,
  total: (n) => `${n} results`,
  selected: (n) => `${n} selected`,
  loading: 'Loading',
  emptyTitle: 'Nothing found',
  errorTitle: 'Failed to load',
  retry: 'Retry',
};

describe('DataTable', () => {
  it('renders a captioned table with a header and a row per record', () => {
    render(<DataTable columns={columns} data={rows} getRowId={(r) => r.id} labels={labels} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'City']);
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('محمد')).toBeInTheDocument();
  });

  it('reports sorting to the caller and reflects it in aria-sort (server-side sorting)', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [sorting, setSorting] = useState<SortingState>([]);
      return (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          labels={labels}
          sorting={{ value: sorting, onChange: (next) => { onChange(next); setSorting(next); } }}
        />
      );
    }
    render(<Harness />);
    const header = screen.getByRole('columnheader', { name: /Name/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(within(header).getByRole('button'));
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'name', desc: false }]);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(within(header).getByRole('button'));
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'name', desc: true }]);
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('does not render the data in a different order itself: sorting is the server\'s job', async () => {
    render(<DataTable columns={columns} data={rows} getRowId={(r) => r.id} labels={labels} sorting={{ value: [{ id: 'name', desc: true }], onChange: () => {} }} />);
    const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]?.textContent);
    expect(names).toEqual(['Asha', '=cmd|calc', 'محمد']);
  });

  it('pages through server-side results', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DataTable columns={columns} data={rows} getRowId={(r) => r.id} labels={labels} pagination={{ pageIndex: 0, pageSize: 10, total: 25, onChange }} />,
    );
    expect(screen.getByText('25 results')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onChange).toHaveBeenCalledWith({ pageIndex: 1, pageSize: 10 });
    rerender(<DataTable columns={columns} data={rows} getRowId={(r) => r.id} labels={labels} pagination={{ pageIndex: 2, pageSize: 10, total: 25, onChange }} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('supports row selection, including select-all', async () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<RowSelectionState>({});
      return <DataTable columns={columns} data={rows} getRowId={(r) => r.id} labels={labels} selection={{ value, onChange: (v) => { onChange(v); setValue(v); } }} />;
    }
    render(<Harness />);
    await userEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[1]!);
    expect(onChange).toHaveBeenLastCalledWith({ '2': true });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(onChange).toHaveBeenLastCalledWith({ '1': true, '2': true, '3': true });
  });

  it('shows empty, loading and error states', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<DataTable columns={columns} data={[]} getRowId={(r) => r.id} labels={labels} />);
    expect(screen.getByText('Nothing found')).toBeInTheDocument();
    rerender(<DataTable columns={columns} data={[]} getRowId={(r) => r.id} labels={labels} loading />);
    expect(screen.getByRole('region', { name: 'People' })).toHaveAttribute('aria-busy', 'true');
    rerender(<DataTable columns={columns} data={[]} getRowId={(r) => r.id} labels={labels} error onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('lets people hide a column from the Columns menu', async () => {
    render(<DataTable columns={columns} data={rows} getRowId={(r) => r.id} labels={labels} />);
    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'City' }));
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'City', hidden: true })).toBeNull());
    // The open menu hides the page from assistive technology, so look through it.
    expect(screen.getByRole('columnheader', { name: 'Name', hidden: true })).toBeInTheDocument();
  });

  it('exports the visible columns as CSV, quoting values and neutralising formulas', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => ((blob = b), 'blob:test'));
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<DataTable columns={columns} data={rows} getRowId={(r) => r.id} labels={labels} exportFileName="people" />);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(click).toHaveBeenCalled();
    // Blob.text() strips the byte-order mark, so check the raw bytes: EF BB BF makes Excel read UTF-8.
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await blob!.text();
    expect(text.split('\r\n')).toEqual(['Name,City', 'Asha,Delhi', "'=cmd|calc,\"Mumbai, MH\"", 'محمد,Chennai']);
    click.mockRestore();
  });
});
