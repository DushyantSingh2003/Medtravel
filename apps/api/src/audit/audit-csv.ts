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
  'userAgent',
  'requestId',
  'before',
  'after',
] as const;

/** One CSV cell. A value that a spreadsheet would run as a formula gets a leading quote; quotes and line breaks are escaped. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  // A spreadsheet runs a cell that starts with = + - @ as a formula, also after leading spaces and control characters.
  if (/^[\s\p{Cc}\u00a0]*[=+\-@]/u.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
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
      event.userAgent,
      event.requestId,
      event.before,
      event.after,
    ]
      .map(csvCell)
      .join(','),
  );
  return `${[COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
}
