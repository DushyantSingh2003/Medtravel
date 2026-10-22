import type { FastifyReply } from 'fastify';
import type { LoginResult } from '@medtravel/contracts';
import type { SessionCookies } from '../../auth/cookies.js';
import type { SignInOutcome } from './sign-in.service.js';

/** Sets the session cookies when the step opened a session, and returns the JSON body. */
export function respond(
  cookies: SessionCookies,
  reply: FastifyReply,
  outcome: SignInOutcome,
): LoginResult {
  if (outcome.session) cookies.set(reply, outcome.session.tokens);
  return outcome.body;
}
