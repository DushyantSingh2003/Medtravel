import { z } from 'zod';
import { caseTargetSchema, stageConfigSchema } from './case-machine.js';
import { caseStageSchema, caseStatusSchema, caseExitStageSchema } from './case-stages.js';
import { caseSourceSchema, urgencySchema } from './enums.js';
import { moneySchema } from './money.js';
import { cursorPageSchema, cursorQuerySchema } from './primitives.js';

const uuid = z.uuid();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

/** The patient of a new case: one that exists, or the few details to create one. */
export const newCasePatientSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(254).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+\d{6,15}$/, 'International format such as +971501234567')
    .optional(),
  nationalityCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  preferredLanguage: z.string().max(8).optional(),
});

export const createCaseSchema = z.object({
  /** Staff and agents name the patient; a patient creates a case for themselves and leaves both out. */
  patientId: uuid.optional(),
  patient: newCasePatientSchema.optional(),
  treatmentId: uuid.optional(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  preferredCityId: uuid.optional(),
  preferredLanguage: z.string().max(8).optional(),
  urgency: urgencySchema.default('routine'),
  source: caseSourceSchema.optional(),
  budget: moneySchema.optional(),
  note: optionalText(2000),
});
export type CreateCase = z.infer<typeof createCaseSchema>;

export const CASE_SORTS = ['createdAt', 'stageEnteredAt', 'slaDueAt', 'caseNo'] as const;

export const caseListQuerySchema = cursorQuerySchema.extend({
  stage: z.union([caseStageSchema, caseExitStageSchema]).optional(),
  status: caseStatusSchema.optional(),
  urgency: urgencySchema.optional(),
  source: caseSourceSchema.optional(),
  ownerId: uuid.optional(),
  /** Only cases past their stage target. */
  overdue: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  /** A case number or part of one. */
  q: z.string().trim().min(2).max(40).optional(),
  sort: z.enum(CASE_SORTS).default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type CaseListQuery = z.infer<typeof caseListQuerySchema>;

/**
 * A case as the caller may see it: the fields their role may read (`FIELD_GROUPS.Case`) are present, the rest are left out.
 */
export const caseViewSchema = z.object({
  id: uuid,
  caseNo: z.string().optional(),
  patientName: z.string().optional(),
  patientId: uuid.optional(),
  stage: z.union([caseStageSchema, caseExitStageSchema]).optional(),
  status: caseStatusSchema.optional(),
  stageEnteredAt: z.iso.datetime().optional(),
  urgency: urgencySchema.optional(),
  plannedArrivalAt: z.iso.datetime().nullable().optional(),
  plannedDepartureAt: z.iso.datetime().nullable().optional(),
  preferredCityId: uuid.nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
  preferredLanguage: z.string().max(8).nullable().optional(),
  treatmentId: uuid.nullable().optional(),
  budget: moneySchema.nullable().optional(),
  ownerId: uuid.nullable().optional(),
  reviewerId: uuid.nullable().optional(),
  hospitalId: uuid.nullable().optional(),
  source: caseSourceSchema.optional(),
  campaign: z.string().max(200).nullable().optional(),
  agentId: uuid.nullable().optional(),
  lostReasonId: uuid.nullable().optional(),
  slaDueAt: z.iso.datetime().nullable().optional(),
  slaBreachedAt: z.iso.datetime().nullable().optional(),
  closedAt: z.iso.datetime().nullable().optional(),
  createdAt: z.iso.datetime(),
  /** Moves the caller could try from here (the data a move needs is only checked when it is made). */
  nextTargets: z.array(caseTargetSchema).optional(),
});
export type CaseView = z.infer<typeof caseViewSchema>;

export const casePageSchema = cursorPageSchema(caseViewSchema);

export const transitionRequestSchema = z.object({
  to: caseTargetSchema,
  note: optionalText(2000),
  lostReasonId: uuid.optional(),
  /** Waive a waivable requirement (the deposit); needs a note. */
  override: z.boolean().optional(),
});
export type TransitionRequest = z.infer<typeof transitionRequestSchema>;

export const stageHistoryItemSchema = z.object({
  id: uuid,
  fromStage: z.union([caseStageSchema, caseExitStageSchema]).nullable(),
  toStage: z.union([caseStageSchema, caseExitStageSchema]),
  note: z.string().max(2000).nullable(),
  actorId: uuid.nullable(),
  createdAt: z.iso.datetime(),
});
export type StageHistoryItem = z.infer<typeof stageHistoryItemSchema>;
export const stageHistoryPageSchema = cursorPageSchema(stageHistoryItemSchema);

export const stageConfigListSchema = z.array(stageConfigSchema);
