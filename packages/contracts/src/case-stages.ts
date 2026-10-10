import { z } from 'zod';

/**
 * The twelve stages every case moves through, in order (PRD section 3).
 *
 * Only identifiers live here. Labels are translated by the apps, and the state machine
 * (allowed transitions, required data, owners, target durations) is added by task F-10 on top of
 * these constants.
 */
export const CASE_STAGES = [
  'enquiry',
  'qualification',
  'medical_review',
  'hospital_opinions',
  'quote_decision',
  'booking_deposit',
  'visa',
  'travel_planning',
  'arrival',
  'treatment',
  'discharge_return',
  'follow_up',
] as const;
export const caseStageSchema = z.enum(CASE_STAGES);
export type CaseStage = z.infer<typeof caseStageSchema>;

/** Stages a case can enter at any point and that sit outside the twelve. */
export const CASE_EXIT_STAGES = ['lost', 'on_hold', 'cancelled'] as const;
export const caseExitStageSchema = z.enum(CASE_EXIT_STAGES);
export type CaseExitStage = z.infer<typeof caseExitStageSchema>;

/** Status values used for filters and reports (PRD section 3). */
export const CASE_STATUSES = [
  'new',
  'qualifying',
  'in_medical_review',
  'awaiting_opinions',
  'quote_sent',
  'won',
  'visa_in_process',
  'travel_booked',
  'arrived',
  'in_treatment',
  'discharged',
  'returned_home',
  'follow_up',
  'closed',
  'lost',
  'on_hold',
  'cancelled',
] as const;
export const caseStatusSchema = z.enum(CASE_STATUSES);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

/** Zero-based position of a stage in the twelve, or -1 for an exit stage. */
export const stageIndex = (stage: CaseStage | CaseExitStage): number =>
  (CASE_STAGES as readonly string[]).indexOf(stage);
