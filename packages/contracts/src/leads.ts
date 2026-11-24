import { z } from 'zod';
import { caseSourceSchema } from './enums.js';
import { caseExitStageSchema, caseStageSchema } from './case-stages.js';
import { cursorPageSchema } from './primitives.js';

// ---- normalising what people type, so the same person matches themselves ----------------------------------------------------

/** `+971 (50) 123-4567` and `00971501234567` as `+971501234567`; null when it is not an international number. */
export function normalisePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s().-]/g, '');
  const international = cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;
  return /^\+[1-9]\d{5,14}$/.test(international) ? international : null;
}

/** The digits of a phone number: what the database compares (it ignores a plus, spaces and dashes). */
export const phoneDigits = (phone: string): string => phone.replace(/\D/g, '');

export const normaliseEmail = (raw: string): string => raw.trim().toLowerCase();

/** A passport number as letters and digits in capitals: `a-123 456` and `A123456` are the same document. */
export const normalisePassport = (raw: string): string => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** A name for comparing: lower case, no accents, single spaces, words in alphabetical order. */
export function normaliseName(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

const bigrams = (text: string): Map<string, number> => {
  const counts = new Map<string, number>();
  const padded = ` ${text} `;
  for (let i = 0; i < padded.length - 1; i += 1) {
    const pair = padded.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
};

/** How alike two names are, 0 to 1 (Dice coefficient on letter pairs, word order ignored). Only ever a hint. */
export function nameSimilarity(a: string, b: string): number {
  const left = normaliseName(a);
  const right = normaliseName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const x = bigrams(left);
  const y = bigrams(right);
  let shared = 0;
  for (const [pair, count] of x) shared += Math.min(count, y.get(pair) ?? 0);
  const total = [...x.values()].reduce((s, n) => s + n, 0) + [...y.values()].reduce((s, n) => s + n, 0);
  return total === 0 ? 0 : (2 * shared) / total;
}

/** A similar name is a hint for staff, not a reason to attach someone to another person's record. */
export const NAME_HINT_THRESHOLD = 0.8;

// ---- what arrives ----------------------------------------------------------------------------------------------------

const uuid = z.uuid();
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const phoneField = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    const phone = normalisePhone(value);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'International format such as +971501234567' });
      return z.NEVER;
    }
    return phone;
  });

const emailField = z
  .string()
  .trim()
  .max(254)
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    const email = normaliseEmail(value);
    if (!z.email().safeParse(email).success) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email address' });
      return z.NEVER;
    }
    return email;
  });

const leadFields = {
  name: z.string().trim().min(2).max(120),
  email: emailField,
  phone: phoneField,
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  language: optional(8),
  treatmentId: uuid.optional(),
  message: optional(5000),
  utmSource: optional(120),
  utmMedium: optional(120),
  utmCampaign: optional(120),
  referrer: optional(500),
  agentCode: optional(40),
};

const contactable = <T extends { email?: string | undefined; phone?: string | undefined }>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  if (!value.email && !value.phone)
    ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Give a phone number or an email address' });
};

/** The website quote form. Only the form's own fields: the source is always the website. */
export const publicLeadSchema = z
  .object({
    ...leadFields,
    privacyAccepted: z.literal(true, { error: 'Please accept the privacy notice' }),
    /** Cloudflare Turnstile's answer for this visitor. */
    turnstileToken: z.string().min(1).max(2048),
    /** A field real visitors never see; a bot that fills it in is turned away. */
    companyWebsite: z.string().max(0).optional(),
  })
  .superRefine(contactable);
export type PublicLead = z.infer<typeof publicLeadSchema>;

export const publicLeadReceivedSchema = z.object({ reference: z.string().max(40) });

/** A lead entered by staff: any source, and optionally a passport number to match on. */
export const createLeadSchema = z
  .object({
    ...leadFields,
    source: caseSourceSchema,
    passportNumber: optional(32),
  })
  .superRefine(contactable);
export type CreateLead = z.infer<typeof createLeadSchema>;

// ---- the inbox ---------------------------------------------------------------------------------------------------------

export const DUPLICATE_STATES = ['none', 'possible', 'dismissed', 'merged'] as const;
export const duplicateStateSchema = z.enum(DUPLICATE_STATES);
export type DuplicateState = z.infer<typeof duplicateStateSchema>;

export const MATCH_FIELDS = ['phone', 'email', 'passport', 'name'] as const;
export const matchFieldSchema = z.enum(MATCH_FIELDS);
export type MatchField = z.infer<typeof matchFieldSchema>;

export const leadRowSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  caseNo: z.string().max(30),
  stage: z.union([caseStageSchema, caseExitStageSchema]),
  source: caseSourceSchema,
  name: z.string().max(200),
  phone: z.string().max(20).nullable(),
  email: z.string().max(254).nullable(),
  countryCode: z.string().length(2).nullable(),
  utmCampaign: z.string().max(120).nullable(),
  /** Someone owns the case; false while it waits for a coordinator to take it. */
  assigned: z.boolean(),
  duplicateState: duplicateStateSchema,
  matchedOn: z.array(matchFieldSchema),
  createdAt: z.iso.datetime(),
});
export type LeadRow = z.infer<typeof leadRowSchema>;

export const leadDetailSchema = leadRowSchema.extend({
  message: z.string().max(5000).nullable(),
  referrer: z.string().max(500).nullable(),
  agentCode: z.string().max(40).nullable(),
  utmSource: z.string().max(120).nullable(),
  utmMedium: z.string().max(120).nullable(),
  language: z.string().max(8).nullable(),
  patientId: z.uuid(),
  /** The existing patient this lead matched, with how many enquiries they have in all. */
  duplicateOf: z
    .object({ patientId: z.uuid(), name: z.string().max(200), enquiries: z.number().int().min(0) })
    .nullable(),
  /** The same patient's other enquiries, newest first. */
  otherEnquiries: z.array(
    z.object({
      leadId: z.uuid(),
      caseId: z.uuid(),
      caseNo: z.string().max(30),
      source: caseSourceSchema,
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type LeadDetail = z.infer<typeof leadDetailSchema>;

export const leadListQuerySchema = z.object({
  source: caseSourceSchema.optional(),
  duplicate: duplicateStateSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(512).optional(),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export const leadPageSchema = cursorPageSchema(leadRowSchema);

export const leadCreatedSchema = z.object({
  leadId: z.uuid(),
  caseId: z.uuid(),
  caseNo: z.string().max(30),
  patientId: z.uuid(),
  /** The lead was attached to a patient we already had. */
  attachedToExisting: z.boolean(),
  duplicateState: duplicateStateSchema,
  matchedOn: z.array(matchFieldSchema),
});
export type LeadCreated = z.infer<typeof leadCreatedSchema>;

/** Which patient record survives a merge: the established one the lead matched (`other`) or the lead's own (`this`). */
export const mergeLeadSchema = z.object({ keep: z.enum(['this', 'other']).default('other') });
export type MergeLead = z.infer<typeof mergeLeadSchema>;
