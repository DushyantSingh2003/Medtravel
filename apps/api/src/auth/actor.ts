import type { Role } from '@medtravel/contracts';

/** Who is making the request. `userId` stays null until real sign-in (F-03) provides one. */
export interface Actor {
  userId: string | null;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor;
  }
}
