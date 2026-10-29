# ADR 008 — One notification engine, delivered through the outbox

Status: accepted (F-07)

## Decision

- Other modules call `NotificationsService.send(tx, { eventKey, recipients, data, dedupeKey })` inside the transaction of the
  change they report. It writes one `Notification` row per person and channel and, for email, SMS and WhatsApp, an outbox
  event `notification.deliver`. If the transaction rolls back, nothing is sent.
- The worker's outbox handler renders the message in the person's language and calls the channel's provider. A failure throws,
  so the outbox retries with backoff; the row counts attempts and becomes `failed` after five (at once for a final refusal).
  `Notification` is also the delivery log: status moves `queued → sent → delivered → read` (or `failed`) from the provider's
  callbacks, never backwards, each callback applied once (`ProcessedWebhook`).
- The registry of events (audience, category, channels, variables) is in `packages/contracts`; the English and Arabic texts are in
  `packages/notifications`, whose spec fails when an event has no text or a text uses an undeclared variable.
- Providers sit behind three small interfaces (`EmailProvider`, `SmsProvider`, `WhatsAppProvider`) chosen by environment:
  SMTP (Mailpit in development, SES in production), Twilio or MSG91, the Meta Cloud API (every BSP offers it). The `dev`
  adapters deliver SMS and WhatsApp to the email inbox, so one Mailpit shows everything. Production refuses the `dev` adapters.
- Sign-in codes and links (OTP, magic links) do not go through the engine: they are secrets that must not be stored in a log, so
  `Mailer` sends them straight through the same providers.
- The log keeps no message text for email, SMS or WhatsApp (the values used to write it are cleared once the message has gone),
  only the event, channel, language, provider, status, attempts and the last error. In-app messages keep their text: they are the
  person's own inbox.

## Why not

BullMQ jobs per channel would add a second queue with its own retry rules next to the outbox, and a job queued before the
business transaction commits can be sent for a change that never happened. Storing templates in the database now would add an
editor, versioning and approval for texts that WhatsApp requires to be pre-approved anyway.

## Consequences

Each business event is wired by the task that owns it; reminders that fire on a clock need the scheduler of C-02. Real
providers must be tried in a sandbox before staging (see docs/progress.md).
