/**
 * CSV helpers for table export.
 *
 * Exports are opened in spreadsheet software, so a cell that starts with `=`, `+`, `-` or `@` would
 * be run as a formula (CSV injection). Such cells are prefixed with an apostrophe, which
 * spreadsheets treat as "text". Patient and hospital names are user-supplied, so this matters.
 */
// Spreadsheets skip leading whitespace and control characters before deciding a cell is a formula.
// eslint-disable-next-line no-control-regex
const FORMULA_START = /^[\u0000-\u0020\u00a0]*[=+\-@]|^[\t\r]/;

/**
 * Numbers are written as numbers (a refund of -5 stays -5 in the sheet); only text is guarded.
 * An invalid Date becomes an empty cell rather than throwing in the middle of an export.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  else text = String(value);
  if (typeof value !== 'number' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/**
 * Starts a browser download. A leading byte-order mark makes Excel read the file as UTF-8, which
 * Arabic and other non-Latin text needs.
 */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking straight away cancels the download in Safari and older Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
