# ADR 009 — Realtime: Socket.IO behind the session, events by id, published after commit

Status: accepted (F-08)

## Decision

- One Socket.IO endpoint in the API (`/realtime`), WebSocket transport only, with the Redis adapter so any API instance reaches
  any socket. A connection needs the same session as a request (cookie or token), an allowed `Origin`, and, like the REST API,
  a finished second factor. A revoked session is dropped within a minute.
- Rooms are `user:<id>` (joined automatically), `case:<id>` and `hospital:<id>`. Joining a case goes through
  `ScopeService.assertCaseAccess`, so the rules for staff scope, patient ownership, hospital consent and agents (never) are the
  ones the REST API uses, and a refused join looks the same as a missing room. A magic-link session may join its one case only.
- Events carry ids and a time, never content (`{ caseId, messageId }`). The browser refetches through the permission-checked API,
  so the push channel can never leak what the API would refuse.
- Business code queues `enqueueRealtime(tx, ...)` in its transaction; the worker publishes after the commit through the Redis
  emitter (the worker holds no sockets). Each publish is also kept in a short per-room log (200 events, one hour) so a reconnecting
  browser can ask for what it missed (`sync { since }`); beyond the log it is told to refetch everything (`resync`).
- The only message a client sends is `typing`, relayed to the others in a room the sender has joined, rate limited, not logged.
- The portal keeps one client for the whole shell. It rejoins rooms and syncs after a reconnect, backs off 1 s to 30 s with jitter,
  refreshes the session when the server dropped it, and turns events into TanStack Query invalidations (`staleBy`).

## Why not

Polling is what the bell did until now and costs a request per person every few seconds. Putting content in the event would have
meant authorising and filtering every payload per recipient. Publishing from the request instead of the outbox would announce
changes that later roll back.

## Consequences

The global guards and the audit interceptor now let non-HTTP contexts through; the gateway does its own authentication and room checks.
