# ADR 006 — Audit rows in the transaction, outbox with a polling dispatcher

Status: accepted (F-05)

## Decision

- Audit rows and outbox events are written with the transaction client of the change they describe, so they exist if and only if
  the change does. Reads (view, download) are recorded by `AuditService.recordAccess` in its own transaction before the
  response is sent.
- Stored values are masked and, for updates, reduced to the changed fields (`maskSensitive`, `diffAudit` in
  `packages/contracts`), so the log cannot become a second copy of secrets or of whole patient records.
- The worker claims outbox events with one `UPDATE ... FOR UPDATE SKIP LOCKED` statement and a visibility timeout, so several
  workers never take the same event and a dead worker's events come back. Handlers are idempotent by the event id; a failing
  handler is retried with exponential backoff and the event is marked `failed` after 6 tries. The runtime lives in
  `packages/db` so it is tested against a real database apart from any app.
- The download alert runs in the transaction of the download, so the count includes it, and an outbox key unique per user and
  hour turns repeats into no-ops without aborting the transaction.

- Audit rows are deleted only inside a transaction that sets `medtravel.audit_retention`; a trigger refuses any other delete.
  An interceptor adds a plain `http.<method>` row for a signed-in change that wrote no audit row of its own.
- An outbox event no handler knows is deferred, not consumed, so a worker that is older than an event does not lose it; an event
  whose worker keeps dying is marked failed after the last allowed try.

## Why not

A database trigger on every table would audit changes nobody asked about (sessions, outbox, counters) and cannot know the
actor; a message broker for the outbox adds infrastructure for a few events per second.

## Consequences

A service that forgets to call `AuditService.record` leaves no row (see the deferred note in docs/progress.md). Handlers
must tolerate repeats.
