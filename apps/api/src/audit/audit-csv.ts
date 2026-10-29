import type { AuditEventView } from '@medtravel/contracts';

const COLUMNS = [
  'time',
  'actor',
  'email',
  'role',
  'action',
  'entityType',
  'entityId',
  'patientId',
  'ip',
  'requestId',
  'before',
  'after',
] as const;

/** One CSV cell. A value that a spreadsheet would run as a formula gets a leading quote; quotes and line breaks are escaped. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function auditCsv(events: AuditEventView[]): string {
  const lines = events.map((event) =>
    [
      event.createdAt,
      event.actorName,
      event.actorEmail,
      event.actorRole,
      event.action,
      event.entityType,
      event.entityId,
      event.patientId,
      event.ip,
      event.requestId,
      event.before,
      event.after,
    ]
      .map(csvCell)
      .join(','),
  );
  return `${[COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
}
