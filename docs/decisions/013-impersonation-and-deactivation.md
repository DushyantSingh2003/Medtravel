# ADR 013 — Deactivation ends access everywhere at once; impersonation is a read-only, signed, audited view

Status: accepted (AD-01)

## Decision

- **Deactivating** a person sets their status, revokes every session, deletes pending sign-in challenges, detaches the teams they led
  and queues an event, in one transaction. The HTTP guard reads the user's status on every request, so the next call from any device
  fails with 401. After the commit the API publishes `session.revoked` to the person's realtime room and disconnects their sockets
  through Redis, so open browsers sign out within seconds instead of at the next request. The last active super admin cannot be
  deactivated or demoted, and nobody can deactivate themselves.
- **Impersonation** is a signed, httpOnly cookie (`mt_imp`, 30 minutes) tied to the super admin's own session id. While it is valid the
  guard makes the target the acting user, and refuses every unsafe method (403). It only works for the admin whose session it names,
  only for active non-admin accounts, and ends when that session ends, the cookie expires or the target is deactivated. Every request
  made while impersonating writes an `impersonation.request` audit row (method and route pattern), including refused attempts, and
  every other audit row written in that request names the admin as the actor and the viewed user in `onBehalfOfId`.
- The only call that acts as the admin during a view is `POST /auth/impersonation/stop`.
- Teams are flat groups with one manager; joining a team sets the member's manager to the team's, so the existing case scoping keeps working.

## Why not

Issuing a real session for the target would hand the admin the person's full powers and leave no clean way back. A header-based
switch would not be tied to a session and could be replayed. Polling for sign-out would keep a deactivated person's screen alive for
as long as the poll interval.

## Consequences

The portal shows the banner from `/auth/me` (`impersonating`) and reloads on start and stop. Realtime sockets are not impersonated (they
use the admin's own cookie). Anything new that must stay out of a read-only view only needs to be an unsafe HTTP method; a GET that
changes state would be visible to the view, so GETs must not change state.
