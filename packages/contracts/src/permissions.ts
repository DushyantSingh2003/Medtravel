import { z } from 'zod';
import type { Role } from './roles.js';

/**
 * Interim permission check, just enough for the first modules (F-02 master data). F-04 replaces the body of `can`
 * with the full role x subject x action matrix and its field-level rules, behind the same signature, so the
 * `@Can` decorator on the API and `useCan` in the portal keep working unchanged.
 */
export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export const permissionActionSchema = z.enum(PERMISSION_ACTIONS);
export type PermissionAction = z.infer<typeof permissionActionSchema>;

export const PERMISSION_SUBJECTS = ['MasterData'] as const;
export const permissionSubjectSchema = z.enum(PERMISSION_SUBJECTS);
export type PermissionSubject = z.infer<typeof permissionSubjectSchema>;

/** Whether `role` may perform `action` on `subject`. Anything not listed is denied. */
export function can(role: Role, action: PermissionAction, subject: PermissionSubject): boolean {
  if (subject === 'MasterData') return action === 'read' || role === 'super_admin';
  return false;
}
