import { roleSchema, type Role } from '@medtravel/contracts';

/** Name of the cookie that holds the stub session. Real sessions (F-03) replace it. */
export const SESSION_COOKIE = 'mt_stub_session';

/** The role in a cookie value, or null when the cookie is missing or not a known role. */
export function parseSessionCookie(value: string | undefined): Role | null {
  const parsed = roleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The stub login lets anyone pick any role, so it is opt-in everywhere: nothing signs in unless
 * ENABLE_STUB_AUTH is exactly "true", which only `apps/portal/.env.example` (local development)
 * and the CI browser-test job set. Never enable it on a deployed environment.
 */
export const isStubAuthEnabled = (): boolean => process.env.ENABLE_STUB_AUTH === 'true';
