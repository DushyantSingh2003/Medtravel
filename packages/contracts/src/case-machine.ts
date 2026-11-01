import { z } from 'zod';
import {
  CASE_EXIT_STAGES,
  CASE_STAGES,
  stageIndex,
  type CaseExitStage,
  type CaseStage,
  type CaseStatus,
} from './case-stages.js';
import { roleSchema, type Role } from './roles.js';

/** Where a case can be sent: any stage, an exit, or `closed` (a finished follow-up; the stage stays `follow_up`). */
export const CASE_TARGETS = [...CASE_STAGES, ...CASE_EXIT_STAGES, 'closed'] as const;
export const caseTargetSchema = z.enum(CASE_TARGETS);
export type CaseTarget = z.infer<typeof caseTargetSchema>;

/** What a case is now: its stage, and whether it was closed after follow-up. */
export interface CaseState {
  stage: CaseStage | CaseExitStage;
  status: CaseStatus;
}

/** Data a move may need. The service looks each one up; this file only names them. */
export const TRANSITION_REQUIREMENTS = [
  'owner_assigned',
  'medical_summary',
  'sent_quote',
  'accepted_quote',
  'deposit_paid',
  'lost_reason',
  'note',
] as const;
export type TransitionRequirement = (typeof TRANSITION_REQUIREMENTS)[number];

export type TransitionKind = 'forward' | 'back' | 'exit' | 'resume' | 'reopen' | 'close';

export type TransitionPlan =
  | { allowed: false; reason: string }
  | {
      allowed: true;
      kind: TransitionKind;
      to: CaseState;
      requires: TransitionRequirement[];
      /** Requirements an authorised person may waive by giving a reason (`override`). */
      overridable: TransitionRequirement[];
    };

/** Status of a case sitting in each of the twelve stages. */
export const STATUS_OF_STAGE: Record<CaseStage, CaseStatus> = {
  enquiry: 'new',
  qualification: 'qualifying',
  medical_review: 'in_medical_review',
  hospital_opinions: 'awaiting_opinions',
  quote_decision: 'quote_sent',
  booking_deposit: 'won',
  visa: 'visa_in_process',
  travel_planning: 'travel_booked',
  arrival: 'arrived',
  treatment: 'in_treatment',
  discharge_return: 'discharged',
  follow_up: 'follow_up',
};

/** Statuses of the exits, and of a closed case. */
const EXIT_STATUS: Record<CaseExitStage | 'closed', CaseStatus> = {
  lost: 'lost',
  on_hold: 'on_hold',
  cancelled: 'cancelled',
  closed: 'closed',
};

/** What must be true to enter each stage from the one before it. */
const ENTRY_REQUIREMENTS: Partial<Record<CaseStage, TransitionRequirement[]>> = {
  qualification: ['owner_assigned'],
  hospital_opinions: ['medical_summary'],
  quote_decision: ['sent_quote'],
  booking_deposit: ['accepted_quote'],
  visa: ['deposit_paid'],
};

const isStage = (value: string): value is CaseStage => stageIndex(value as CaseStage) >= 0;
const isOpen = (state: CaseState): boolean => isStage(state.stage) && state.status !== 'closed';

const no = (reason: string): TransitionPlan => ({ allowed: false, reason });

const stageState = (stage: CaseStage): CaseState => ({ stage, status: STATUS_OF_STAGE[stage] });

/**
 * Whether a case may be moved to `target`, what that makes it, and what the move needs. `resumeStage` is the stage the case
 * left when it went on hold or was lost (the service reads it from the stage history); it is the only stage such a case can
 * go back to.
 */
export function describeTransition(
  from: CaseState,
  target: CaseTarget,
  resumeStage?: CaseStage | null,
): TransitionPlan {
  if (from.status === 'closed') return no('The case is closed');
  if (from.stage === 'cancelled') return no('The case was cancelled');
  if (target === from.stage) return no('The case is already there');

  // Leaving an exit.
  if (from.stage === 'on_hold' || from.stage === 'lost') {
    if (target === 'cancelled' && from.stage === 'on_hold')
      return {
        allowed: true,
        kind: 'exit',
        to: { stage: 'cancelled', status: EXIT_STATUS.cancelled },
        requires: ['note'],
        overridable: [],
      };
    if (target === 'lost' && from.stage === 'on_hold')
      return {
        allowed: true,
        kind: 'exit',
        to: { stage: 'lost', status: EXIT_STATUS.lost },
        requires: ['lost_reason'],
        overridable: [],
      };
    if (!isStage(target))
      return no('A case that is on hold or lost can only go back to where it was');
    if (!resumeStage || target !== resumeStage)
      return no('A case that is on hold or lost can only go back to the stage it left');
    return {
      allowed: true,
      kind: from.stage === 'on_hold' ? 'resume' : 'reopen',
      to: stageState(target),
      requires: from.stage === 'lost' ? ['note'] : [],
      overridable: [],
    };
  }

  // Here the case sits in one of the twelve stages and is not closed.
  if (!isOpen(from)) return no('The case cannot be moved');
  const at = stageIndex(from.stage as CaseStage);

  if (target === 'closed') {
    if (from.stage !== 'follow_up') return no('Only a case in follow-up can be closed');
    return {
      allowed: true,
      kind: 'close',
      to: { stage: 'follow_up', status: EXIT_STATUS.closed },
      requires: [],
      overridable: [],
    };
  }
  if (target === 'lost')
    return {
      allowed: true,
      kind: 'exit',
      to: { stage: 'lost', status: EXIT_STATUS.lost },
      requires: ['lost_reason'],
      overridable: [],
    };
  if (target === 'on_hold' || target === 'cancelled')
    return {
      allowed: true,
      kind: 'exit',
      to: { stage: target, status: EXIT_STATUS[target] },
      requires: ['note'],
      overridable: [],
    };

  const to = stageIndex(target);
  if (to === at + 1) {
    const requires = ENTRY_REQUIREMENTS[target] ?? [];
    return {
      allowed: true,
      kind: 'forward',
      to: stageState(target),
      requires,
      overridable: requires.filter((r) => r === 'deposit_paid'),
    };
  }
  if (to === at - 1)
    return {
      allowed: true,
      kind: 'back',
      to: stageState(target),
      requires: ['note'],
      overridable: [],
    };
  return no('A case moves one stage at a time');
}

/** What the service found out about the case; `describeTransition` only says which of these it needs. */
export interface TransitionFacts {
  ownerAssigned: boolean;
  hasMedicalSummary: boolean;
  hasSentQuote: boolean;
  hasAcceptedQuote: boolean;
  depositPaid: boolean;
}

export interface TransitionInput {
  note?: string | null;
  lostReasonId?: string | null;
  override?: boolean;
}

const FACT_OF: Record<
  Exclude<TransitionRequirement, 'lost_reason' | 'note'>,
  keyof TransitionFacts
> = {
  owner_assigned: 'ownerAssigned',
  medical_summary: 'hasMedicalSummary',
  sent_quote: 'hasSentQuote',
  accepted_quote: 'hasAcceptedQuote',
  deposit_paid: 'depositPaid',
};

/**
 * The requirements not met. A waivable one (`overridable`) is met by `override` with a note; the waiver itself is checked by
 * the caller against the actor's role (`canOverride`).
 */
export function missingRequirements(
  plan: Extract<TransitionPlan, { allowed: true }>,
  facts: TransitionFacts,
  input: TransitionInput,
): TransitionRequirement[] {
  const hasNote = Boolean(input.note?.trim());
  return plan.requires.filter((requirement) => {
    if (requirement === 'note') return !hasNote;
    if (requirement === 'lost_reason') return !input.lostReasonId;
    if (facts[FACT_OF[requirement]]) return false;
    return !(plan.overridable.includes(requirement) && input.override && hasNote);
  });
}

// ---- who ----------------------------------------------------------------------------------------------------------
/** The role that owns work in each stage (PRD section 3). */
export const STAGE_OWNER_ROLE: Record<CaseStage, Role> = {
  enquiry: 'case_manager',
  qualification: 'case_manager',
  medical_review: 'medical_reviewer',
  hospital_opinions: 'hospital_desk',
  quote_decision: 'case_manager',
  booking_deposit: 'finance',
  visa: 'case_manager',
  travel_planning: 'case_manager',
  arrival: 'ground_coordinator',
  treatment: 'ground_coordinator',
  discharge_return: 'hospital_desk',
  follow_up: 'case_manager',
};

/** Roles that run every case. */
const CASE_RUNNERS: readonly Role[] = ['super_admin', 'case_manager'];
/** Roles that may waive a waivable requirement. */
const OVERRIDERS: readonly Role[] = ['super_admin', 'case_manager', 'finance'];

/**
 * Whether a role may move a case out of its current state: the people who run cases always, anyone else only while the
 * case is in a stage their role owns. Exits and reopening are for case runners only.
 */
export function canMoveCase(role: Role, from: CaseState, target: CaseTarget): boolean {
  if (CASE_RUNNERS.includes(role)) return true;
  if (!isStage(from.stage) || from.status === 'closed') return false;
  if (!isStage(target) && target !== 'closed') return false;
  return STAGE_OWNER_ROLE[from.stage as CaseStage] === role;
}

export const canOverrideRequirement = (role: Role): boolean => OVERRIDERS.includes(role);

// ---- time and automatic tasks -------------------------------------------------------------------------------------
/** How long a case should take in each stage, in minutes (null: no target). Admins can change these (`StageConfig`). */
export const DEFAULT_STAGE_TARGET_MINUTES: Record<CaseStage, number | null> = {
  enquiry: 15,
  qualification: 120,
  medical_review: 24 * 60,
  hospital_opinions: 48 * 60,
  quote_decision: 72 * 60,
  booking_deposit: 72 * 60,
  visa: 14 * 24 * 60,
  travel_planning: 5 * 24 * 60,
  arrival: 24 * 60,
  treatment: null,
  discharge_return: 48 * 60,
  follow_up: null,
};

export const autoTaskSchema = z.object({
  /** Stable within the stage; with the stage it keeps the task from being created twice. */
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  title: z.string().trim().min(1).max(120),
  assigneeRole: roleSchema,
  /** Minutes after entering the stage that the task is due. */
  dueInMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 90),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});
export type AutoTask = z.infer<typeof autoTaskSchema>;

const task = (
  key: string,
  title: string,
  assigneeRole: Role,
  dueInMinutes: number,
  priority: AutoTask['priority'] = 'normal',
): AutoTask => ({ key, title, assigneeRole, dueInMinutes, priority });

/** Tasks created when a case enters a stage (PRD section 3); admins can change them. */
export const DEFAULT_AUTO_TASKS: Record<CaseStage, AutoTask[]> = {
  enquiry: [task('assign', 'Assign a case manager', 'case_manager', 15, 'high')],
  qualification: [
    task('first_call', 'First call or chat with the patient', 'case_manager', 120, 'high'),
  ],
  medical_review: [task('summary', 'Write the one-page case summary', 'medical_reviewer', 24 * 60)],
  hospital_opinions: [
    task('send_to_hospitals', 'Send the case to the selected hospitals', 'case_manager', 4 * 60),
  ],
  quote_decision: [
    task('present', 'Present the comparison to the patient', 'case_manager', 24 * 60),
  ],
  booking_deposit: [task('confirm_deposit', 'Confirm the deposit has arrived', 'finance', 24 * 60)],
  visa: [task('invitation', 'Upload the medical invitation letter', 'case_manager', 3 * 24 * 60)],
  travel_planning: [
    task('airport_pickup', 'Book airport pickup', 'ground_coordinator', 24 * 60),
    task('book_travel', 'Book flights and stay', 'case_manager', 2 * 24 * 60),
  ],
  arrival: [task('meet', 'Meet the patient at the airport', 'ground_coordinator', 0, 'urgent')],
  treatment: [
    task('daily_update', 'Send the family the daily status update', 'ground_coordinator', 24 * 60),
  ],
  discharge_return: [
    task('medicines', 'Arrange medicines and the airport drop', 'ground_coordinator', 24 * 60),
  ],
  follow_up: [
    task('teleconsults', 'Schedule the follow-up teleconsults', 'case_manager', 7 * 24 * 60),
  ],
};

export const stageConfigSchema = z.object({
  stage: z.enum(CASE_STAGES),
  targetMinutes: z
    .number()
    .int()
    .min(1)
    .max(60 * 24 * 365)
    .nullable(),
  ownerRole: roleSchema,
  autoTasks: z.array(autoTaskSchema).max(10),
});
export type StageConfig = z.infer<typeof stageConfigSchema>;

export const stageConfigUpdateSchema = stageConfigSchema.omit({ stage: true });
export type StageConfigUpdate = z.infer<typeof stageConfigUpdateSchema>;
