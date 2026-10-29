'use client';

import {
  can,
  type PermissionAction,
  type PermissionSubject,
  type Role,
} from '@medtravel/contracts';
import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';

type CanFn = (action: PermissionAction, subject: PermissionSubject, field?: string) => boolean;

const PermissionsContext = createContext<Role | null>(null);

/** Tells every component below which role is signed in, so `useCan` can answer from the shared permission matrix. */
export function PermissionsProvider({ role, children }: { role: Role; children?: ReactNode }) {
  return createElement(PermissionsContext.Provider, { value: role }, children);
}

/**
 * Whether the signed-in role may do something, from the same matrix the API enforces (`@medtravel/contracts`). Use it to
 * hide buttons and menu entries; the API remains the only real gate. Outside a provider nothing is allowed.
 */
export function useCan(): CanFn {
  const role = useContext(PermissionsContext);
  return useMemo<CanFn>(
    () => (action, subject, field) => (role ? can(role, action, subject, field) : false),
    [role],
  );
}
