import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FIELD_GROUPS,
  PERMISSION_ACTIONS,
  PERMISSION_MATRIX,
  PERMISSION_SUBJECTS,
  SCOPES,
  can,
  pickReadable,
  readableFields,
  scopeOf,
  type PermissionAction,
  type PermissionSubject,
} from './permissions.js';
import { permissionsMarkdown } from './permissions-doc.js';
import { ROLES, type Role } from './roles.js';

const LETTER: Record<PermissionAction, string> = {
  read: 'r',
  create: 'c',
  update: 'u',
  delete: 'd',
  export: 'x',
};

/** Independent of the matrix code: what each role may do, written out. `-` is no access. */
const EXPECTED: Record<Role, Partial<Record<PermissionSubject, string>>> = {
  patient: {
    MasterData: 'r',
    Case: 'rcu',
    Patient: 'ru',
    Document: 'rcud',
    MedicalSummary: 'r',
    Opinion: 'r',
    Quote: 'ru',
    Invoice: 'r',
    Payment: 'rc',
    Refund: 'rc',
    Visa: 'ru',
    Booking: 'r',
    Admission: 'r',
    Hospital: 'r',
    Conversation: 'rcu',
    Consent: 'rcu',
    Feedback: 'rc',
    Notification: 'ru',
  },
  attendant: {
    MasterData: 'r',
    Case: 'r',
    Patient: 'r',
    Document: 'rc',
    Visa: 'ru',
    Booking: 'r',
    Hospital: 'r',
    Conversation: 'rcu',
    Notification: 'ru',
  },
  agent: {
    MasterData: 'r',
    Case: 'rc',
    Patient: 'r',
    Hospital: 'r',
    Agent: 'ru',
    Commission: 'r',
    Payout: 'r',
    Notification: 'ru',
  },
  case_manager: {
    MasterData: 'r',
    Case: 'rcu',
    Patient: 'rcu',
    Document: 'rcu',
    MedicalSummary: 'r',
    Opinion: 'r',
    Quote: 'rcu',
    Invoice: 'r',
    Payment: 'r',
    Refund: 'rc',
    Visa: 'rcu',
    Booking: 'rcud',
    Admission: 'r',
    Hospital: 'r',
    Agent: 'r',
    Commission: 'r',
    Task: 'rcud',
    Conversation: 'rcu',
    Incident: 'ru',
    Consent: 'r',
    Feedback: 'r',
    Notification: 'ru',
    Report: 'rx',
  },
  ground_coordinator: {
    MasterData: 'r',
    Case: 'ru',
    Patient: 'r',
    Booking: 'ru',
    Admission: 'r',
    Hospital: 'r',
    Task: 'rcu',
    Conversation: 'rcu',
    Incident: 'rcu',
    Notification: 'ru',
  },
  interpreter: {
    MasterData: 'r',
    Case: 'r',
    Patient: 'r',
    Booking: 'ru',
    Task: 'ru',
    Conversation: 'rcu',
    Notification: 'ru',
  },
  medical_reviewer: {
    MasterData: 'r',
    Case: 'ru',
    Patient: 'r',
    Document: 'rcu',
    MedicalSummary: 'rcu',
    Opinion: 'r',
    Hospital: 'r',
    Task: 'rcu',
    Conversation: 'rcu',
    Notification: 'ru',
  },
  hospital_desk: {
    MasterData: 'r',
    Case: 'ru',
    Patient: 'r',
    Document: 'rcu',
    MedicalSummary: 'r',
    Opinion: 'rcu',
    Visa: 'rcu',
    Admission: 'rcu',
    Hospital: 'ru',
    Task: 'ru',
    Conversation: 'rcu',
    Consent: 'r',
    Notification: 'ru',
    Report: 'r',
  },
  doctor: {
    MasterData: 'r',
    Case: 'r',
    Patient: 'r',
    Document: 'r',
    MedicalSummary: 'r',
    Opinion: 'rcu',
    Admission: 'ru',
    Hospital: 'r',
    Conversation: 'rcu',
    Notification: 'ru',
  },
  finance: {
    MasterData: 'r',
    Case: 'r',
    Patient: 'r',
    Quote: 'r',
    Invoice: 'rcu',
    Payment: 'rcu',
    Refund: 'rcu',
    Booking: 'r',
    Hospital: 'r',
    Agent: 'r',
    Commission: 'rcu',
    Payout: 'rcux',
    Notification: 'ru',
    Report: 'rx',
  },
  super_admin: Object.fromEntries(
    PERMISSION_SUBJECTS.map((subject) => [subject, subject === 'AuditLog' ? 'rx' : 'rcudx']),
  ),
};

describe('permission matrix, every role against every subject and action', () => {
  const cases = ROLES.flatMap((role) =>
    PERMISSION_SUBJECTS.flatMap((subject) =>
      PERMISSION_ACTIONS.map((action) => ({
        role,
        subject,
        action,
        allowed: (EXPECTED[role][subject] ?? '').includes(LETTER[action]),
      })),
    ),
  );

  it('covers all 11 roles, every subject and every action', () => {
    expect(ROLES).toHaveLength(11);
    expect(cases).toHaveLength(
      ROLES.length * PERMISSION_SUBJECTS.length * PERMISSION_ACTIONS.length,
    );
  });

  it.each(cases)('$role $action $subject -> $allowed', ({ role, subject, action, allowed }) => {
    expect(can(role, action, subject)).toBe(allowed);
  });

  it('has an entry in the expectations for every matrix cell, and none for a missing one', () => {
    for (const role of ROLES)
      for (const subject of PERMISSION_SUBJECTS)
        expect(PERMISSION_MATRIX[role][subject]?.actions, `${role} ${subject}`).toBe(
          EXPECTED[role][subject],
        );
  });

  it('gives every cell a known scope', () => {
    for (const role of ROLES)
      for (const subject of PERMISSION_SUBJECTS) {
        const scope = scopeOf(role, subject);
        if (scope) expect(SCOPES).toContain(scope);
        else expect(EXPECTED[role][subject], `${role} ${subject}`).toBeUndefined();
      }
  });
});

describe('the rules that must never regress', () => {
  const MEDICAL_AND_MONEY: PermissionSubject[] = [
    'Document',
    'MedicalSummary',
    'Opinion',
    'Quote',
    'Invoice',
    'Payment',
    'Refund',
    'Visa',
    'Booking',
    'Admission',
    'Consent',
    'Incident',
    'Task',
    'Conversation',
    'Report',
  ];

  it('never lets an agent touch documents, medical summaries, opinions, quotes or money', () => {
    for (const subject of MEDICAL_AND_MONEY)
      for (const action of PERMISSION_ACTIONS)
        expect(can('agent', action, subject), `agent ${action} ${subject}`).toBe(false);
  });

  it('shows an agent only the case number, name, stage and status', () => {
    expect(readableFields('agent', 'Case')).toEqual([
      'caseNo',
      'patientName',
      'stage',
      'status',
      'stageEnteredAt',
      'urgency',
    ]);
    for (const field of ['diagnosis', 'medicalNotes', 'budgetMinor', 'treatmentId', 'agentId'])
      expect(can('agent', 'read', 'Case', field), field).toBe(false);
    expect(can('agent', 'read', 'Case', 'stage')).toBe(true);
    expect(readableFields('agent', 'Patient')).toEqual(['fullName']);
    expect(can('agent', 'read', 'Patient', 'dateOfBirth')).toBe(false);
    expect(can('agent', 'read', 'Patient', 'passportNumber')).toBe(false);
  });

  it('keeps medical text away from finance and the ground team, and money away from hospitals', () => {
    for (const role of ['finance', 'ground_coordinator', 'interpreter'] as const)
      expect(can(role, 'read', 'Case', 'diagnosis'), role).toBe(false);
    for (const role of ['hospital_desk', 'doctor'] as const) {
      expect(can(role, 'read', 'Case', 'budgetMinor'), role).toBe(false);
      for (const subject of [
        'Invoice',
        'Payment',
        'Quote',
        'Refund',
        'Commission',
        'Payout',
      ] as const)
        expect(can(role, 'read', subject), `${role} ${subject}`).toBe(false);
    }
  });

  it('lets only the super admin change users, settings and master data, and only it read the audit log', () => {
    for (const role of ROLES) {
      const admin = role === 'super_admin';
      for (const subject of ['User', 'Setting', 'AuditLog', 'NotificationLog'] as const)
        expect(can(role, 'read', subject), `${role} read ${subject}`).toBe(admin);
      for (const action of ['create', 'update', 'delete'] as const)
        expect(can(role, action, 'MasterData'), `${role} ${action} MasterData`).toBe(admin);
      expect(can(role, 'read', 'MasterData')).toBe(true);
    }
  });

  it('lets only finance and the super admin issue invoices, payments and payouts', () => {
    for (const role of ROLES)
      for (const subject of ['Invoice', 'Payout'] as const)
        expect(can(role, 'create', subject), `${role} ${subject}`).toBe(
          role === 'finance' || role === 'super_admin',
        );
  });

  it('keeps patients and attendants out of every staff subject', () => {
    for (const role of ['patient', 'attendant'] as const)
      for (const subject of [
        'User',
        'Setting',
        'AuditLog',
        'NotificationLog',
        'Agent',
        'Commission',
        'Payout',
        'Report',
      ] as const)
        for (const action of PERMISSION_ACTIONS)
          expect(can(role, action, subject), `${role} ${subject}`).toBe(false);
  });

  it('scopes each role as the PRD says', () => {
    expect(scopeOf('patient', 'Case')).toBe('own');
    expect(scopeOf('attendant', 'Case')).toBe('attached');
    expect(scopeOf('agent', 'Case')).toBe('referrals');
    expect(scopeOf('case_manager', 'Case')).toBe('team');
    expect(scopeOf('ground_coordinator', 'Case')).toBe('city_window');
    expect(scopeOf('hospital_desk', 'Case')).toBe('hospital');
    expect(scopeOf('doctor', 'Case')).toBe('assigned');
    expect(scopeOf('interpreter', 'Case')).toBe('assigned');
    expect(scopeOf('medical_reviewer', 'Case')).toBe('assigned');
    expect(scopeOf('finance', 'Case')).toBe('all');
    expect(scopeOf('super_admin', 'Case')).toBe('all');
    expect(scopeOf('agent', 'Document')).toBeNull();
  });
});

describe('field rules', () => {
  it('only name groups that exist', () => {
    for (const role of ROLES)
      for (const subject of Object.keys(FIELD_GROUPS) as (keyof typeof FIELD_GROUPS)[]) {
        const groups = PERMISSION_MATRIX[role][subject]?.fields ?? [];
        for (const group of groups)
          expect(Object.keys(FIELD_GROUPS[subject]), `${role} ${subject}`).toContain(group);
      }
  });

  it('puts field rules only on subjects that define field groups', () => {
    for (const role of ROLES)
      for (const subject of PERMISSION_SUBJECTS)
        if (PERMISSION_MATRIX[role][subject]?.fields)
          expect(Object.keys(FIELD_GROUPS), `${role} ${subject}`).toContain(subject);
  });

  it('returns every field to roles with no field rules, and the permitted ones to the rest', () => {
    expect(readableFields('super_admin', 'Case')).toBeNull();
    expect(pickReadable('super_admin', 'Case', { diagnosis: 'x', stage: 'enquiry' })).toEqual({
      diagnosis: 'x',
      stage: 'enquiry',
    });
    expect(
      pickReadable('agent', 'Case', {
        caseNo: 'C1',
        patientName: 'A',
        stage: 'enquiry',
        diagnosis: 'x',
        budgetMinor: 5,
      }),
    ).toEqual({ caseNo: 'C1', patientName: 'A', stage: 'enquiry' });
  });
});

describe('docs/permissions.md', () => {
  it('is generated from the matrix (run pnpm --filter @medtravel/contracts docs:permissions)', () => {
    const file = new URL('../../../docs/permissions.md', import.meta.url);
    expect(readFileSync(file, 'utf8')).toBe(permissionsMarkdown());
  });
});
