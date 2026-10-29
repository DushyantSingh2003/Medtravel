import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import { z } from 'zod';
import {
  FIELD_GROUPS,
  PERMISSION_ACTIONS,
  PERMISSION_SUBJECTS,
  cellOf,
  type FieldedSubject,
  type PermissionAction,
  type PermissionSubject,
  type Scope,
} from './permission-matrix.js';
import type { Role } from './roles.js';

export {
  PERMISSION_ACTIONS,
  PERMISSION_MATRIX,
  PERMISSION_SUBJECTS,
  FIELD_GROUPS,
  SCOPES,
} from './permission-matrix.js';
export type {
  MatrixCell,
  PermissionAction,
  PermissionSubject,
  Scope,
  FieldedSubject,
} from './permission-matrix.js';

export const permissionActionSchema = z.enum(PERMISSION_ACTIONS);
export const permissionSubjectSchema = z.enum(PERMISSION_SUBJECTS);

const ACTION_OF_LETTER: Record<string, PermissionAction> = {
  r: 'read',
  c: 'create',
  u: 'update',
  d: 'delete',
  x: 'export',
};

type RoleAbility = MongoAbility<[PermissionAction, PermissionSubject]>;

function buildAbility(role: Role): RoleAbility {
  const { can: allow, build } = new AbilityBuilder<RoleAbility>(createMongoAbility);
  for (const subject of PERMISSION_SUBJECTS) {
    const cell = cellOf(role, subject);
    if (!cell) continue;
    const actions = [...cell.actions].map(
      (letter) => ACTION_OF_LETTER[letter],
    ) as PermissionAction[];
    const fields = cell.fields ? fieldsOf(subject, cell.fields) : undefined;
    if (fields) allow(actions, subject, fields);
    else allow(actions, subject);
  }
  return build();
}

function fieldsOf(subject: PermissionSubject, groups: readonly string[]): string[] | undefined {
  if (!(subject in FIELD_GROUPS)) return undefined;
  const known = FIELD_GROUPS[subject as FieldedSubject] as Record<string, readonly string[]>;
  return groups.flatMap((group) => known[group] ?? []);
}

const abilities = new Map<Role, RoleAbility>();
function abilityOf(role: Role): RoleAbility {
  let ability = abilities.get(role);
  if (!ability) {
    ability = buildAbility(role);
    abilities.set(role, ability);
  }
  return ability;
}

/**
 * Whether `role` may perform `action` on `subject` (and, with `field`, touch that field of it). Anything not in the matrix
 * is denied. Used by `@Can` on the API and `useCan` in the portal.
 */
export function can(
  role: Role,
  action: PermissionAction,
  subject: PermissionSubject,
  field?: string,
): boolean {
  return field === undefined
    ? abilityOf(role).can(action, subject)
    : abilityOf(role).can(action, subject, field);
}

/** Whose records the role sees for the subject, or null when it has no access. */
export function scopeOf(role: Role, subject: PermissionSubject): Scope | null {
  return cellOf(role, subject)?.scope ?? null;
}

/** The fields of `subject` the role may read, or null when it may read all of them (or has no field rules). */
export function readableFields(role: Role, subject: FieldedSubject): readonly string[] | null {
  const cell = cellOf(role, subject);
  if (!cell?.fields) return null;
  return fieldsOf(subject, cell.fields) ?? null;
}

/** Keeps only the fields the role may read; a record of a subject without field rules is returned unchanged. */
export function pickReadable<T extends Record<string, unknown>>(
  role: Role,
  subject: FieldedSubject,
  record: T,
): Partial<T> {
  const allowed = readableFields(role, subject);
  if (!allowed) return record;
  const keep = new Set(allowed);
  return Object.fromEntries(Object.entries(record).filter(([key]) => keep.has(key))) as Partial<T>;
}
