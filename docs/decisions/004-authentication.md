# ADR 004 — Authentication: server-side sessions, cookie tokens, enforced two-factor

Status: accepted (F-03)

## Decision

- A sign-in creates a `Session` row. The browser holds a 15-minute signed access token (`mt_at`), a rotating 30-day
  refresh token (`mt_rt`, only its hash is stored) and a readable CSRF token (`mt_csrf`). Every request checks the session
  row, so sign-out and "sign out other devices" apply at once. Replaying a rotated refresh token ends the session.
- Cookie-authenticated unsafe requests need the `x-csrf-token` header (double submit) and an allowed `Origin`. Bearer
  tokens (API clients, tests) skip CSRF.
- Argon2id for passwords; TOTP with hashed backup codes for the second factor, the secret encrypted with AES-256-GCM.
  Roles that must use two-factor get a limited session until they enrol; there is no flag to skip it outside development.
- One-time secrets (verification, reset, sign-in code, invitation, magic link) share the `AuthChallenge` table and are
  stored hashed. Requests that could reveal whether an address has an account answer identically.
- The portal reads the session from `GET /auth/me` and its middleware swaps an expired access cookie for a new one using
  the refresh cookie. The refresh cookie has `Path=/` for that reason; the API and portal must share a host (ports may differ).

## Why not

JWT-only sessions cannot be revoked; an auth framework would hide the lockout, rotation and limited-session rules we
need to own and test.

## Consequences

Throttling is per process until Redis backs it; the secrets need real values and rotation at deployment.
