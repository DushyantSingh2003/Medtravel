import { portalOfRole, type Locale, type Portal, type Role } from '@medtravel/contracts';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { redirect } from '../../i18n/navigation';
import { SESSION_COOKIE, isStubAuthEnabled, parseSessionCookie } from './session-cookie';

export interface Session {
  role: Role;
  portal: Portal;
}

/** The signed-in user, or null. Read once per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!isStubAuthEnabled()) return null;
  const store = await cookies();
  const role = parseSessionCookie(store.get(SESSION_COOKIE)?.value);
  return role ? { role, portal: portalOfRole(role) } : null;
});

export async function createSession(role: Role): Promise<void> {
  if (!isStubAuthEnabled()) throw new Error('Stub sign-in is switched off');
  const store = await cookies();
  store.set(SESSION_COOKIE, role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Guard for a portal's pages: signed out goes to the login page, and a user who belongs to another
 * portal goes to their own. Layouts do not re-run on client-side navigation, so pages call this too.
 */
export async function requirePortalSession(locale: Locale, portal: Portal): Promise<Session> {
  const session = await getSession();
  if (!session) return redirect({ href: '/login', locale });
  if (session.portal !== portal) return redirect({ href: `/${session.portal}`, locale });
  return session;
}
