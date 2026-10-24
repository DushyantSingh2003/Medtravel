import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { apiBaseUrl } from './lib/auth/api-url';

const intl = createMiddleware(routing);

/** Refreshes already in flight, by refresh token: parallel requests of one browser share one call, so none of them replays a spent token. */
const inFlight = new Map<string, Promise<string[] | null>>();

/** Swaps a refresh token for new cookies at the API. Resolves to the `Set-Cookie` headers, or null when the session is over. */
function refreshSession(refreshToken: string, cookieHeader: string): Promise<string[] | null> {
  const existing = inFlight.get(refreshToken);
  if (existing) return existing;
  const attempt = fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  })
    .then((response) => (response.ok ? response.headers.getSetCookie() : null))
    .catch(() => null)
    .finally(() => setTimeout(() => inFlight.delete(refreshToken), 5_000));
  inFlight.set(refreshToken, attempt);
  return attempt;
}

/**
 * The access token cookie lives 15 minutes; the refresh cookie 30 days. When a page is requested with only the refresh
 * cookie, swap it for a new access token first, and send the browser back to the same address carrying the new cookies,
 * so the page renders signed in instead of bouncing the user to the login page every quarter of an hour.
 */
export default async function middleware(request: NextRequest) {
  const refreshToken = request.cookies.get('mt_rt')?.value;
  const isPageRequest = request.method === 'GET' || request.method === 'HEAD';
  if (isPageRequest && refreshToken && !request.cookies.has('mt_at')) {
    const cookies = await refreshSession(refreshToken, request.headers.get('cookie') ?? '');
    if (cookies && cookies.length > 0) {
      const response = NextResponse.redirect(request.nextUrl);
      for (const cookie of cookies) response.headers.append('set-cookie', cookie);
      return response;
    }
    // The session is over: forget the dead refresh token so later requests do not try it again.
    const response = intl(request);
    response.headers.append('set-cookie', 'mt_rt=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    return response;
  }
  return intl(request);
}

export const config = {
  // Run on every path except Next internals, the API proxy and anything with a file extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
