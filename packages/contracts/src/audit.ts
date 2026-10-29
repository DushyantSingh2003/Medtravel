import { z } from 'zod';
import { cursorPageSchema, cursorQuerySchema } from './primitives.js';

/** Actions the audit trail uses for reads (changes use `<entity>.<created|updated|deleted>` from their modules). */
export const AUDIT_ACCESS_ACTIONS = [
  'document.viewed',
  'document.downloaded',
  'patient.viewed',
  'patient.exported',
] as const;
export const auditAccessActionSchema = z.enum(AUDIT_ACCESS_ACTIONS);
export type AuditAccessAction = z.infer<typeof auditAccessActionSchema>;

/** One user downloading more than this many documents inside the window raises an incident (PRD 12). */
export const DOWNLOAD_ALERT_LIMIT = 50;
export const DOWNLOAD_ALERT_WINDOW_MINUTES = 60;

/** Most rows one CSV export returns. */
export const AUDIT_EXPORT_MAX_ROWS = 10_000;

// ---- masking and diff -----------------------------------------------------------------------------------------
export const MASK = '[masked]';

/** Keys whose value must never reach the log, matched case-insensitively. */
const SECRET_KEY = /pass(word|phrase)|secret|token|otp|hash|^code$|credential|authorization|cookie|csrf|apikey/i;
/** Personal identifiers that are hidden from the log, except the last four characters of a passport number. */
const PASSPORT_KEY = /passport.?(number|no)$/i;
const PERSONAL_KEY = /^(dateofbirth|dob|email|phone|address)$/i;

function maskKey(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (SECRET_KEY.test(key)) return MASK;
  if (PASSPORT_KEY.test(key) && typeof value === 'string')
    return value.length > 4 ? `${'*'.repeat(value.length - 4)}${value.slice(-4)}` : MASK;
  if (PERSONAL_KEY.test(key)) return MASK;
  return undefined;
}

/** A copy of `value` with every sensitive field replaced (secrets entirely, passport numbers down to their last four). */
export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskSensitive(item));
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => {
        const masked = maskKey(key, inner);
        return [key, masked === undefined ? maskSensitive(inner) : masked];
      }),
    );
  }
  return value;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * What changed between two versions of a record: only the keys whose value differs, in both `before` and `after`. A
 * create (no `before`) or a delete (no `after`) keeps the whole side that exists.
 */
export function diffAudit(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  if (!before || !after) return { before: before ?? null, after: after ?? null };
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue;
    if (key in before) changedBefore[key] = before[key];
    if (key in after) changedAfter[key] = after[key];
  }
  return { before: changedBefore, after: changedAfter };
}

// ---- list, filters, export ------------------------------------------------------------------------------------
const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const isoDate = z.iso.datetime({ offset: true });

export const auditFiltersSchema = z.object({
  /** A fragment of the actor's name or email. */
  actor: optionalText(120),
  actorId: z.uuid().optional(),
  entityType: optionalText(64),
  entityId: optionalText(64),
  /** An exact action, or a prefix ending in `.` such as `document.`. */
  action: optionalText(64),
  patientId: z.uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

export const auditListQuerySchema = cursorQuerySchema.extend(auditFiltersSchema.shape);
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export const auditEventSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  actorId: z.uuid().nullable(),
  actorName: z.string().max(200).nullable(),
  actorEmail: z.string().max(200).nullable(),
  actorRole: z.string().max(32).nullable(),
  action: z.string().max(100),
  entityType: z.string().max(100),
  entityId: z.string().max(100),
  patientId: z.uuid().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().max(45).nullable(),
  userAgent: z.string().max(500).nullable(),
  requestId: z.string().max(100).nullable(),
});
export type AuditEventView = z.infer<typeof auditEventSchema>;

export const auditPageSchema = cursorPageSchema(auditEventSchema);
