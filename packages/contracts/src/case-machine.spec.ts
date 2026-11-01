import { describe, expect, it } from 'vitest';
import {
  CASE_STAGES,
  CASE_TARGETS,
  DEFAULT_AUTO_TASKS,
  DEFAULT_STAGE_TARGET_MINUTES,
  STAGE_OWNER_ROLE,
  STATUS_OF_STAGE,
  canMoveCase,
  canOverrideRequirement,
  describeTransition,
  missingRequirements,
  type CaseState,
  type CaseTarget,
  type TransitionFacts,
} from './index.js';
import { ROLES } from './roles.js';

const open = (stage: (typeof CASE_STAGES)[number]): CaseState => ({
  stage,
  status: STATUS_OF_STAGE[stage],
});
const held: CaseState = { stage: 'on_hold', status: 'on_hold' };
const lost: CaseState = { stage: 'lost', status: 'lost' };
const cancelled: CaseState = { stage: 'cancelled', status: 'cancelled' };
const closed: CaseState = { stage: 'follow_up', status: 'closed' };

const allowedTargets = (from: CaseState, resume?: (typeof CASE_STAGES)[number]): CaseTarget[] =>
  CASE_TARGETS.filter((target) => describeTransition(from, target, resume).allowed);

describe('the transition matrix: every state against every target', () => {
  it.each(CASE_STAGES.map((stage, index) => [stage, index] as const))(
    'from %s a case can go forward one, back one, to an exit, and nowhere else',
    (stage, index) => {
      const expected: CaseTarget[] = [];
      if (index > 0) expected.push(CASE_STAGES[index - 1] as CaseTarget);
      if (index < CASE_STAGES.length - 1) expected.push(CASE_STAGES[index + 1] as CaseTarget);
      expected.push('lost', 'on_hold', 'cancelled');
      if (stage === 'follow_up') expected.push('closed');
      expect(allowedTargets(open(stage)).sort()).toEqual(expected.sort());
    },
  );

  it('refuses every target from a closed or cancelled case', () => {
    expect(allowedTargets(closed)).toEqual([]);
    expect(allowedTargets(cancelled, 'visa')).toEqual([]);
  });

  it('lets a case on hold resume only where it was, or become lost or cancelled', () => {
    expect(allowedTargets(held, 'visa').sort()).toEqual(['cancelled', 'lost', 'visa']);
    expect(allowedTargets(held).sort()).toEqual(['cancelled', 'lost']);
  });

  it('lets a lost case be reopened only at the stage it was lost in', () => {
    expect(allowedTargets(lost, 'arrival')).toEqual(['arrival']);
    expect(allowedTargets(lost)).toEqual([]);
  });

  it('refuses a move to the stage the case is already in', () => {
    for (const stage of CASE_STAGES)
      expect(describeTransition(open(stage), stage).allowed).toBe(false);
  });

  it('refuses skipping a stage in either direction', () => {
    expect(describeTransition(open('enquiry'), 'medical_review').allowed).toBe(false);
    expect(describeTransition(open('visa'), 'quote_decision').allowed).toBe(false);
    expect(describeTransition(open('enquiry'), 'follow_up').allowed).toBe(false);
  });

  it('only closes a case from follow-up', () => {
    for (const stage of CASE_STAGES.filter((s) => s !== 'follow_up'))
      expect(describeTransition(open(stage), 'closed').allowed).toBe(false);
    expect(describeTransition(open('follow_up'), 'closed')).toMatchObject({
      allowed: true,
      kind: 'close',
      to: { stage: 'follow_up', status: 'closed' },
    });
  });

  it('gives every move a status that matches its target', () => {
    for (const [index, stage] of CASE_STAGES.entries()) {
      const next = CASE_STAGES[index + 1];
      if (!next) continue;
      expect(describeTransition(open(stage), next)).toMatchObject({
        to: { stage: next, status: STATUS_OF_STAGE[next] },
      });
    }
    expect(describeTransition(open('visa'), 'lost')).toMatchObject({ to: { status: 'lost' } });
    expect(describeTransition(open('visa'), 'on_hold')).toMatchObject({
      to: { status: 'on_hold' },
    });
    expect(describeTransition(open('visa'), 'cancelled')).toMatchObject({
      to: { status: 'cancelled' },
    });
  });
});

describe('what a move needs', () => {
  const needs = (from: CaseState, to: CaseTarget, resume?: (typeof CASE_STAGES)[number]) => {
    const plan = describeTransition(from, to, resume);
    if (!plan.allowed) throw new Error(plan.reason);
    return plan.requires;
  };

  it('asks for the right data on each forward move', () => {
    expect(needs(open('enquiry'), 'qualification')).toEqual(['owner_assigned']);
    expect(needs(open('qualification'), 'medical_review')).toEqual([]);
    expect(needs(open('medical_review'), 'hospital_opinions')).toEqual(['medical_summary']);
    expect(needs(open('hospital_opinions'), 'quote_decision')).toEqual(['sent_quote']);
    expect(needs(open('quote_decision'), 'booking_deposit')).toEqual(['accepted_quote']);
    expect(needs(open('booking_deposit'), 'visa')).toEqual(['deposit_paid']);
    expect(needs(open('visa'), 'travel_planning')).toEqual([]);
  });

  it('asks for a reason to lose a case and a note to hold, cancel, go back or reopen', () => {
    expect(needs(open('visa'), 'lost')).toEqual(['lost_reason']);
    expect(needs(open('visa'), 'on_hold')).toEqual(['note']);
    expect(needs(open('visa'), 'cancelled')).toEqual(['note']);
    expect(needs(open('visa'), 'booking_deposit')).toEqual(['note']);
    expect(needs(lost, 'visa', 'visa')).toEqual(['note']);
    expect(needs(held, 'visa', 'visa')).toEqual([]);
  });

  const none: TransitionFacts = {
    ownerAssigned: false,
    hasMedicalSummary: false,
    hasSentQuote: false,
    hasAcceptedQuote: false,
    depositPaid: false,
  };
  const plan = (from: CaseState, to: CaseTarget) => {
    const result = describeTransition(from, to);
    if (!result.allowed) throw new Error(result.reason);
    return result;
  };

  it('lists what is missing, and nothing once it is there', () => {
    const toVisa = plan(open('booking_deposit'), 'visa');
    expect(missingRequirements(toVisa, none, {})).toEqual(['deposit_paid']);
    expect(missingRequirements(toVisa, { ...none, depositPaid: true }, {})).toEqual([]);
    const lose = plan(open('visa'), 'lost');
    expect(missingRequirements(lose, none, {})).toEqual(['lost_reason']);
    expect(missingRequirements(lose, none, { lostReasonId: 'r1' })).toEqual([]);
    const hold = plan(open('visa'), 'on_hold');
    expect(missingRequirements(hold, none, { note: '   ' })).toEqual(['note']);
    expect(missingRequirements(hold, none, { note: 'Patient is ill' })).toEqual([]);
  });

  it('accepts a manual override for the deposit only with a reason, and for nothing else', () => {
    const toVisa = plan(open('booking_deposit'), 'visa');
    expect(missingRequirements(toVisa, none, { override: true })).toEqual(['deposit_paid']);
    expect(
      missingRequirements(toVisa, none, { override: true, note: 'Bank transfer pending' }),
    ).toEqual([]);
    const toQuote = plan(open('hospital_opinions'), 'quote_decision');
    expect(missingRequirements(toQuote, none, { override: true, note: 'Please' })).toEqual([
      'sent_quote',
    ]);
    const toBooking = plan(open('quote_decision'), 'booking_deposit');
    expect(missingRequirements(toBooking, none, { override: true, note: 'Please' })).toEqual([
      'accepted_quote',
    ]);
  });
});

describe('who may move a case', () => {
  it('lets case managers and the super admin move any case', () => {
    for (const stage of CASE_STAGES) {
      expect(canMoveCase('case_manager', open(stage), 'on_hold')).toBe(true);
      expect(canMoveCase('super_admin', open(stage), 'lost')).toBe(true);
    }
    expect(canMoveCase('case_manager', lost, 'visa')).toBe(true);
  });

  it('never lets patients, attendants, agents, interpreters or doctors move one', () => {
    for (const role of ['patient', 'attendant', 'agent', 'interpreter', 'doctor'] as const)
      for (const stage of CASE_STAGES)
        expect(canMoveCase(role, open(stage), 'visa'), `${role} in ${stage}`).toBe(false);
  });

  it('lets another staff role move a case on only while it owns the stage, and never to an exit', () => {
    expect(canMoveCase('medical_reviewer', open('medical_review'), 'hospital_opinions')).toBe(true);
    expect(canMoveCase('medical_reviewer', open('visa'), 'travel_planning')).toBe(false);
    expect(canMoveCase('ground_coordinator', open('arrival'), 'treatment')).toBe(true);
    expect(canMoveCase('hospital_desk', open('discharge_return'), 'follow_up')).toBe(true);
    expect(canMoveCase('finance', open('booking_deposit'), 'visa')).toBe(true);
    expect(canMoveCase('finance', open('booking_deposit'), 'lost')).toBe(false);
    expect(canMoveCase('finance', held, 'visa')).toBe(false);
    expect(canMoveCase('hospital_desk', closed, 'closed')).toBe(false);
  });

  it('uses the owner role an admin configured instead of the built-in one', () => {
    expect(canMoveCase('finance', open('visa'), 'travel_planning')).toBe(false);
    expect(canMoveCase('finance', open('visa'), 'travel_planning', 'finance')).toBe(true);
    expect(
      canMoveCase('hospital_desk', open('hospital_opinions'), 'quote_decision', 'finance'),
    ).toBe(false);
  });

  it('lets only finance, case managers and the super admin waive a requirement', () => {
    expect(ROLES.filter(canOverrideRequirement).sort()).toEqual([
      'case_manager',
      'finance',
      'super_admin',
    ]);
  });
});

describe('stage defaults', () => {
  it('gives every stage an owner role, a target (or none) and its automatic tasks', () => {
    for (const stage of CASE_STAGES) {
      expect(STAGE_OWNER_ROLE[stage]).toBeTruthy();
      expect(
        DEFAULT_STAGE_TARGET_MINUTES[stage] === null || DEFAULT_STAGE_TARGET_MINUTES[stage]! > 0,
      ).toBe(true);
      const keys = DEFAULT_AUTO_TASKS[stage].map((t) => t.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('follows the PRD: pickup is booked for the ground coordinator once travel is planned', () => {
    expect(DEFAULT_AUTO_TASKS.travel_planning).toContainEqual(
      expect.objectContaining({ title: 'Book airport pickup', assigneeRole: 'ground_coordinator' }),
    );
    expect(DEFAULT_STAGE_TARGET_MINUTES.enquiry).toBe(15);
    expect(DEFAULT_STAGE_TARGET_MINUTES.hospital_opinions).toBe(48 * 60);
  });
});
