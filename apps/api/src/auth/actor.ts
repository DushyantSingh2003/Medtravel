import type { Role } from '@medtravel/contracts';

/** Who is making the request: the signed-in user and the session they are using. */
export interface Actor {
  userId: string;
  role: Role;
  sessionId: string;
  /** Set for a magic-link session: the one case it may see. */
  scopeCaseId: string | null;
  /** Set while a super admin is looking at the product as this user: the admin's id. Everything is read-only and audited. */
  impersonatorId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor;
    /** True for a session that has not completed two-factor yet; it may only use `@AllowLimitedSession` routes. */
    limitedSession?: boolean;
    /** Present while `actor` is someone a super admin is impersonating. */
    impersonation?: { by: string; expiresAt: string };
  }
}
