import {
  FIELD_GROUPS,
  PERMISSION_MATRIX,
  PERMISSION_SUBJECTS,
  type PermissionSubject,
} from './permission-matrix.js';
import { ROLES, type Role } from './roles.js';

const LABEL: Record<string, string> = {
  r: 'read',
  c: 'create',
  u: 'update',
  d: 'delete',
  x: 'export',
};

const ROLE_NAME: Record<Role, string> = {
  patient: 'Patient',
  attendant: 'Attendant',
  agent: 'Agent',
  case_manager: 'Case manager',
  ground_coordinator: 'Ground coordinator',
  interpreter: 'Interpreter',
  medical_reviewer: 'Medical reviewer',
  hospital_desk: 'Hospital desk',
  doctor: 'Doctor',
  finance: 'Finance',
  super_admin: 'Super admin',
};

function row(role: Role, subject: PermissionSubject): string {
  const cell = PERMISSION_MATRIX[role][subject];
  if (!cell) return '—';
  const fields = cell.fields ? `; fields: ${cell.fields.join(', ')}` : '';
  return `${[...cell.actions].map((letter) => LABEL[letter]).join(', ')} (${cell.scope}${fields})`;
}

/** `docs/permissions.md`, generated from the matrix: edit `permission-matrix.ts`, never the document. */
export function permissionsMarkdown(): string {
  const lines: string[] = [
    '# Permissions',
    '',
    '_Generated from `packages/contracts/src/permission-matrix.ts` by `pnpm --filter @medtravel/contracts docs:permissions`. Do not edit by hand._',
    '',
    'Each cell lists the actions a role may take on a kind of record, then the **scope** (whose records) and, where the',
    'role sees only part of a record, the **field groups**. A dash means no access. Data scoping is applied in one place,',
    '`apps/api/src/rbac`; hospital users see only documents shared with their hospital by a live consent.',
    '',
    '## Scopes',
    '',
    '| Scope | Meaning |',
    '| --- | --- |',
    '| all | every record |',
    "| own | the user's own records (their patient file, their notifications) |",
    "| team | own cases plus the same team's; a manager sees all |",
    "| city_window | cases in the user's city with a planned arrival within 30 days either way |",
    "| hospital | cases sent to the user's hospital |",
    '| assigned | cases assigned to the user (doctor: opinion requests; interpreter: bookings; reviewer: reviews) |',
    "| referrals | cases referred by the user's agency |",
    '| attached | cases the user is an invited attendant of |',
    '',
    '## Field groups',
    '',
  ];
  for (const [subject, groups] of Object.entries(FIELD_GROUPS)) {
    lines.push(`**${subject}**`, '');
    for (const [group, fields] of Object.entries(groups))
      lines.push(`- \`${group}\`: ${fields.join(', ')}`);
    lines.push('');
  }
  lines.push('## Matrix by role', '');
  for (const role of ROLES) {
    lines.push(`### ${ROLE_NAME[role]} (\`${role}\`)`, '', '| Subject | Access |', '| --- | --- |');
    for (const subject of PERMISSION_SUBJECTS) lines.push(`| ${subject} | ${row(role, subject)} |`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
