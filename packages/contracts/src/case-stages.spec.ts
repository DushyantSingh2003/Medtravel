import { describe, expect, it } from 'vitest';
import {
  CASE_EXIT_STAGES,
  CASE_STAGES,
  CASE_STATUSES,
  caseStageSchema,
  caseStatusSchema,
  stageIndex,
} from './case-stages.js';

describe('case stages', () => {
  it('has the twelve stages of PRD section 3, in order', () => {
    expect(CASE_STAGES).toHaveLength(12);
    expect(CASE_STAGES[0]).toBe('enquiry');
    expect(CASE_STAGES[11]).toBe('follow_up');
  });

  it('has the three exit stages', () => {
    expect([...CASE_EXIT_STAGES]).toEqual(['lost', 'on_hold', 'cancelled']);
  });

  it('has the seventeen status values of PRD section 3', () => {
    expect(CASE_STATUSES).toHaveLength(17);
    expect(new Set(CASE_STATUSES).size).toBe(17);
  });

  it('validates identifiers', () => {
    expect(caseStageSchema.safeParse('visa').success).toBe(true);
    expect(caseStageSchema.safeParse('lost').success).toBe(false);
    expect(caseStatusSchema.safeParse('in_treatment').success).toBe(true);
    expect(caseStatusSchema.safeParse('Visa').success).toBe(false);
  });

  it('returns the position of a stage, or -1 for an exit stage', () => {
    expect(stageIndex('enquiry')).toBe(0);
    expect(stageIndex('visa')).toBe(6);
    expect(stageIndex('lost')).toBe(-1);
  });
});
