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

/** Keys whose value must never reach the log, matched case-insensitively: credentials, tokens, secrets and payment details. */
const SECRET_KEY =
  /pass(word|phrase)|secret|token|(^|[_-])otp|otp($|[_-]|code|secret)|hash|^code$|credential|authorization|cookie|csrf|api.?key|cvv|card.?number|iban|account.?number|aadhaar|aadhar|ssn/i;
/** Passport fields: a number keeps its last four characters, anything else about a passport is hidden. */
const PASSPORT_KEY = /passport/i;
const PASSPORT_NUMBER_KEY = /passport.?(number|no)$/i;
/** Personal identifiers and contact details, hidden entirely. */
const PERSONAL_KEY =
  /birth|(^|[_-])dob($|[_-])|phone|mobile|whatsapp|e.?mail|address|street|postal|postcode|zip/i;
/** Medical and free text: CLAUDE.md says it is never logged. */
const MEDICAL_KEY =
  /diagnos|symptom|medical|prescription|allerg|history|notes?($|[A-Z_-])|summary|comment|remark/i;

function maskKey(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (SECRET_KEY.test(key) || PERSONAL_KEY.test(key) || MEDICAL_KEY.test(key)) return MASK;
  if (PASSPORT_KEY.test(key)) {
    if (PASSPORT_NUMBER_KEY.test(key) && typeof value === 'string' && value.length > 4)
      return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
    return MASK;
  }
  return undefined;
}

/**
 * A copy of `value` safe to store: sensitive fields replaced (secrets, contact details and medical text entirely, passport
 * numbers down to their last four characters), dates as ISO strings, big numbers and decimals as strings.
 */
export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskSensitive(item));
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return MASK;
  if (value && typeof value === 'object') {
    // Decimals and the like know how to write themselves out.
    const withJson = value as { toJSON?: () => unknown };
    if (typeof withJson.toJSON === 'function') return maskSensitive(withJson.toJSON());
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => {
        const masked = maskKey(key, inner);
        return [key, masked === undefined ? maskSensitive(inner) : masked];
      }),
    );
  }
  return value;
}

/** JSON with the keys of every object in sorted order, so two equal values compare equal whatever their key order. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (typeof inner === 'bigint') return inner.toString();
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return Object.fromEntries(
        Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return inner;
  });
}

const same = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b);

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
  /** A fragment of the actor's name or email, at least three characters. */
  actor: z.string().trim().min(3).max(120).optional(),
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
  // `catchall` rather than `record`: nestjs-zod renders a record's key schema as `propertyNames`, which orval rejects.
  before: z.object({}).catchall(z.unknown()).nullable(),
  after: z.object({}).catchall(z.unknown()).nullable(),
  ip: z.string().max(45).nullable(),
  userAgent: z.string().max(500).nullable(),
  requestId: z.string().max(100).nullable(),
});
export type AuditEventView = z.infer<typeof auditEventSchema>;

export const auditPageSchema = cursorPageSchema(auditEventSchema);
