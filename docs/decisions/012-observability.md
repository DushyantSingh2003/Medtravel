# ADR 012 — One request ID end to end; error reports are scrubbed before they leave

Status: accepted (F-12)

## Decision

- Every request has an ID: the caller's `X-Request-Id` if it is 8–64 safe characters, otherwise generated. It is returned in the
  response (and exposed to browsers), written on every log line, stored in the payload of the events the request queues, used by the
  worker for the logs and error reports of that event, and tagged on every Sentry report.
- Error reports go through `scrubEvent` in `beforeSend`: no cookies, headers except a short allow-list, request body, query string,
  local variables or source lines; the user is only an id; free text loses emails, tokens and long numbers. The same function runs in
  the browser, the Next server and the Node services. Unexpected errors are logged scrubbed and answered with a plain 500; the
  default Nest handler, which logs the raw message, is not used for them.
- Logs keep query parameter names but never their values, and request addresses are logged without the query string.
- Metrics label by route pattern, never by address. `/metrics` is bearer-protected; the queue board is read-only and super-admin only.
- Readiness is a separate probe from liveness so a dependency outage takes the instance out of rotation without restarting it.

## Why not

Sending default Sentry data and relying on the dashboard's server-side scrubbing would put personal data in a third party first.
Putting ids in metric labels would create unbounded series.

## Consequences

New code that logs or throws should not put personal data in messages; the scrubber is a safety net, not a licence. Anything that
queues work should do it through `OutboxService` so the ID travels.
