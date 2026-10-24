import {
  authUserSchema,
  portalOfRole,
  type AuthUser,
  type Locale,
  type Portal,
  type Role,
} from '@medtravel/contracts';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { redirect } from '../../i18n/navigation';
import { apiBaseUrl } from './api-url';

export interface Session {
  user: AuthUser;
  role: Role;
  portal: Portal;
}

/**
 * The signed-in user, asked of the API with the browser's own cookies (the access token cookie is set by the API on a
 * domain the portal shares). Read once per request. Null when nobody is signed in, the session ended, or the API is
 * unreachable: a page cannot be shown without knowing who is looking at it.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  if (!store.has('mt_at')) return null;
  try {
    const response = await fetch(`${apiBaseUrl()}/auth/me`, {
      headers: { cookie: store.toString() },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const user = authUserSchema.parse(await response.json());
    return { user, role: user.role, portal: portalOfRole(user.role) };
  } catch {
    return null;
  }
});

/** Where a signed-in user belongs: set up two-factor first if their session is limited, else their portal. */
export const homeOf = (session: Session): string =>
  session.user.access === 'two_factor_setup' ? '/two-factor/setup' : `/${session.portal}`;

/**
 * Guard for a portal's pages: signed out goes to the login page, a limited session (two-factor not set up yet) goes to the
 * set-up page, and a user who belongs to another portal goes to their own. Layouts do not re-run on client-side
 * navigation, so pages call this too.
 */
export async function requirePortalSession(locale: Locale, portal: Portal): Promise<Session> {
  const session = await getSession();
  if (!session) return redirect({ href: '/login', locale });
  if (session.user.access === 'two_factor_setup')
    return redirect({ href: '/two-factor/setup', locale });
  if (session.portal !== portal) return redirect({ href: `/${session.portal}`, locale });
  return session;
}

/** For pages every signed-in user has (their account): any portal, but not a limited session. */
export async function requireAccountSession(locale: Locale): Promise<Session> {
  const session = await getSession();
  if (!session) return redirect({ href: '/login', locale });
  if (session.user.access === 'two_factor_setup')
    return redirect({ href: '/two-factor/setup', locale });
  return session;
}

/** For the two-factor set-up page: signed in, with or without a limited session. */
export async function requireAnySession(locale: Locale): Promise<Session> {
  const session = await getSession();
  if (!session) return redirect({ href: '/login', locale });
  return session;
}
