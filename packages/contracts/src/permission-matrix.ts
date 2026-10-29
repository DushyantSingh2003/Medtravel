import type { Role } from './roles.js';

/** What a role may do with a kind of record. */
export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete', 'export'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_SUBJECTS = [
  'MasterData',
  'Case',
  'Patient',
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
  'Hospital',
  'Agent',
  'Commission',
  'Payout',
  'Task',
  'Conversation',
  'Incident',
  'Consent',
  'Feedback',
  'Notification',
  'User',
  'AuditLog',
  'Report',
  'Setting',
] as const;
export type PermissionSubject = (typeof PERMISSION_SUBJECTS)[number];

/**
 * Whose records a role sees, for a subject. The API turns each into a database filter in one place (`apps/api/src/rbac`):
 * - `all`: every record;
 * - `own`: the user's own records (their patient file, their notifications);
 * - `team`: own cases plus those of the same team; a manager sees everything;
 * - `city_window`: cases in the user's city with a planned arrival within 30 days either way;
 * - `hospital`: cases sent to the user's hospital;
 * - `assigned`: cases assigned to the user (a doctor's opinion requests, an interpreter's bookings, a reviewer's cases);
 * - `referrals`: cases referred by the user's agency;
 * - `attached`: cases the user is an invited attendant of.
 */
export const SCOPES = [
  'all',
  'own',
  'team',
  'city_window',
  'hospital',
  'assigned',
  'referrals',
  'attached',
] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * Groups of fields on the records where roles see different parts. A role with no field list sees every field of the
 * subject it can read.
 */
export const FIELD_GROUPS = {
  Case: {
    identity: ['caseNo', 'patientName'],
    stage: ['stage', 'status', 'stageEnteredAt', 'urgency'],
    travel: [
      'plannedArrivalAt',
      'plannedDepartureAt',
      'preferredCityId',
      'countryCode',
      'preferredLanguage',
    ],
    medical: ['treatmentId', 'diagnosis', 'medicalNotes'],
    money: ['budgetMinor', 'budgetCurrency'],
    assignment: ['ownerId', 'reviewerId', 'hospitalId'],
    commercial: ['source', 'campaign', 'agentId', 'lostReasonId', 'lostNote'],
  },
  Patient: {
    identity: ['fullName', 'gender', 'dateOfBirth', 'nationalityCode'],
    contact: ['email', 'phone', 'address', 'emergencyContact'],
    passport: ['passportNumber', 'passportExpiry'],
    medical: ['medicalHistory', 'allergies'],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;
export type FieldedSubject = keyof typeof FIELD_GROUPS;
export type FieldGroup<S extends FieldedSubject> = keyof (typeof FIELD_GROUPS)[S] & string;

export interface MatrixCell {
  /** `r` read, `c` create, `u` update, `d` delete, `x` export. */
  actions: string;
  scope: Scope;
  /** Field groups the role may read; absent means all of them. Only for the subjects in `FIELD_GROUPS`. */
  fields?: readonly string[];
}

type RoleMatrix = Partial<Record<PermissionSubject, MatrixCell>>;

const cell = (actions: string, scope: Scope, fields?: readonly string[]): MatrixCell =>
  fields ? { actions, scope, fields } : { actions, scope };

/** Every signed-in role reads the master data lists; only the super admin changes them. */
const masters = cell('r', 'all');

const STAFF_CASE_FIELDS = [
  'identity',
  'stage',
  'travel',
  'medical',
  'money',
  'assignment',
  'commercial',
];

/**
 * The permission matrix: role × subject → actions, scope, fields. Anything not listed is denied. Change it here and run
 * `pnpm --filter @medtravel/contracts docs:permissions` (the test fails while `docs/permissions.md` is stale).
 */
export const PERMISSION_MATRIX: Record<Role, RoleMatrix> = {
  patient: {
    MasterData: masters,
    Case: cell('rcu', 'own'),
    Patient: cell('ru', 'own'),
    Document: cell('rcud', 'own'),
    MedicalSummary: cell('r', 'own'),
    Opinion: cell('r', 'own'),
    Quote: cell('ru', 'own'),
    Invoice: cell('r', 'own'),
    Payment: cell('rc', 'own'),
    Refund: cell('rc', 'own'),
    Visa: cell('ru', 'own'),
    Booking: cell('r', 'own'),
    Admission: cell('r', 'own'),
    Hospital: cell('r', 'all'),
    Conversation: cell('rcu', 'own'),
    Consent: cell('rcu', 'own'),
    Feedback: cell('rc', 'own'),
    Notification: cell('ru', 'own'),
  },
  attendant: {
    MasterData: masters,
    Case: cell('r', 'attached', ['identity', 'stage', 'travel']),
    Patient: cell('r', 'attached', ['identity', 'contact']),
    Document: cell('rc', 'attached'),
    Visa: cell('ru', 'attached'),
    Booking: cell('r', 'attached'),
    Hospital: cell('r', 'all'),
    Conversation: cell('rcu', 'attached'),
    Notification: cell('ru', 'own'),
  },
  agent: {
    MasterData: masters,
    // An agent sees where their referral is and who it is, nothing medical and nothing about money.
    Case: cell('rc', 'referrals', ['identity', 'stage']),
    Patient: cell('r', 'referrals', ['identity']),
    Hospital: cell('r', 'all'),
    Agent: cell('ru', 'own'),
    Commission: cell('r', 'own'),
    Payout: cell('r', 'own'),
    Conversation: cell('rcu', 'referrals'),
    Notification: cell('ru', 'own'),
    Report: cell('rx', 'referrals'),
  },
  case_manager: {
    MasterData: masters,
    Case: cell('rcu', 'team', STAFF_CASE_FIELDS),
    Patient: cell('rcu', 'team'),
    Document: cell('rcu', 'team'),
    MedicalSummary: cell('r', 'team'),
    Opinion: cell('r', 'team'),
    Quote: cell('rcu', 'team'),
    Invoice: cell('r', 'team'),
    Payment: cell('r', 'team'),
    Refund: cell('rc', 'team'),
    Visa: cell('rcu', 'team'),
    Booking: cell('rcud', 'team'),
    Admission: cell('r', 'team'),
    Hospital: cell('r', 'all'),
    Agent: cell('r', 'all'),
    Commission: cell('r', 'team'),
    Task: cell('rcud', 'team'),
    Conversation: cell('rcu', 'team'),
    Incident: cell('ru', 'team'),
    Consent: cell('r', 'team'),
    Feedback: cell('r', 'team'),
    Notification: cell('ru', 'own'),
    Report: cell('rx', 'team'),
  },
  ground_coordinator: {
    MasterData: masters,
    Case: cell('ru', 'city_window', ['identity', 'stage', 'travel', 'assignment']),
    Patient: cell('r', 'city_window', ['identity', 'contact']),
    Booking: cell('ru', 'city_window'),
    Admission: cell('r', 'city_window'),
    Hospital: cell('r', 'all'),
    Task: cell('rcu', 'city_window'),
    Conversation: cell('rcu', 'city_window'),
    Incident: cell('rcu', 'city_window'),
    Notification: cell('ru', 'own'),
  },
  interpreter: {
    MasterData: masters,
    Case: cell('r', 'assigned', ['identity', 'stage', 'travel']),
    Patient: cell('r', 'assigned', ['identity']),
    Booking: cell('ru', 'assigned'),
    Task: cell('ru', 'assigned'),
    Conversation: cell('rcu', 'assigned'),
    Notification: cell('ru', 'own'),
  },
  medical_reviewer: {
    MasterData: masters,
    Case: cell('ru', 'assigned', ['identity', 'stage', 'travel', 'medical', 'assignment']),
    Patient: cell('r', 'assigned', ['identity', 'medical']),
    Document: cell('rcu', 'assigned'),
    MedicalSummary: cell('rcu', 'assigned'),
    Opinion: cell('r', 'assigned'),
    Hospital: cell('r', 'all'),
    Task: cell('rcu', 'assigned'),
    Conversation: cell('rcu', 'assigned'),
    Notification: cell('ru', 'own'),
  },
  hospital_desk: {
    MasterData: masters,
    Case: cell('ru', 'hospital', ['identity', 'stage', 'travel', 'medical', 'assignment']),
    Patient: cell('r', 'hospital', ['identity', 'contact', 'passport', 'medical']),
    // Only the documents the patient shared with this hospital (see ScopeService.documentWhere).
    Document: cell('rcu', 'hospital'),
    MedicalSummary: cell('r', 'hospital'),
    Opinion: cell('rcu', 'hospital'),
    Visa: cell('rcu', 'hospital'),
    Admission: cell('rcu', 'hospital'),
    Hospital: cell('ru', 'hospital'),
    Task: cell('ru', 'hospital'),
    Conversation: cell('rcu', 'hospital'),
    Consent: cell('r', 'hospital'),
    Notification: cell('ru', 'own'),
    Report: cell('r', 'hospital'),
  },
  doctor: {
    MasterData: masters,
    Case: cell('r', 'assigned', ['identity', 'stage', 'travel', 'medical']),
    Patient: cell('r', 'assigned', ['identity', 'medical']),
    Document: cell('r', 'assigned'),
    MedicalSummary: cell('r', 'assigned'),
    Opinion: cell('rcu', 'assigned'),
    Admission: cell('ru', 'assigned'),
    Hospital: cell('r', 'all'),
    Conversation: cell('rcu', 'assigned'),
    Notification: cell('ru', 'own'),
  },
  finance: {
    MasterData: masters,
    Case: cell('r', 'all', ['identity', 'stage', 'money', 'assignment', 'commercial']),
    Patient: cell('r', 'all', ['identity']),
    Quote: cell('r', 'all'),
    Invoice: cell('rcud', 'all'),
    Payment: cell('rcu', 'all'),
    Refund: cell('rcu', 'all'),
    Booking: cell('r', 'all'),
    Admission: cell('r', 'all'),
    Hospital: cell('r', 'all'),
    Agent: cell('r', 'all'),
    Commission: cell('rcu', 'all'),
    Payout: cell('rcux', 'all'),
    Notification: cell('ru', 'own'),
    Report: cell('rx', 'all'),
  },
  super_admin: Object.fromEntries(
    PERMISSION_SUBJECTS.map((subject) => [
      subject,
      cell(subject === 'AuditLog' ? 'rx' : 'rcudx', subject === 'Notification' ? 'own' : 'all'),
    ]),
  ) as RoleMatrix,
};

/** The cell for a role and subject, or undefined when the role has no access at all. */
export function cellOf(role: Role, subject: PermissionSubject): MatrixCell | undefined {
  return PERMISSION_MATRIX[role][subject];
}
