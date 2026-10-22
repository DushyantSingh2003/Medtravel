# 003 — The master data module is the reference for every module

- **Status:** accepted
- **Date:** 2026-10-22
- **Source:** task F-02 (`docs/BUILD_PLAN.md`), PRD section 9.1.

## Context

F-02 is the first API module and the first admin screen. Every later module is copied from it (the
`scaffold-module` skill points at `apps/api/src/modules/masters`), so the way it is built is decided here.
Authentication (F-03), the permission matrix (F-04) and the audit log (F-05) come later and have to plug into it
without rewriting it.

## Decisions

1. **One resource-driven module for eight tables.** `GET/POST /masters/:resource` and `/masters/:resource/:id`
   serve countries, languages, currencies, specialities, treatments, cities, document types and lost reasons.
   Each table is an _adapter_ (`modules/masters/adapters`): typed Prisma calls for list, get, create, update and
   soft delete, plus the table's Zod schemas from `packages/contracts`. The service holds what is the same for
   all (transaction, audit, outbox, error mapping). A new table is an adapter and an entry in
   `MASTER_DEFINITIONS`, not a new controller. A module with its own endpoints per entity (cases, quotes) follows
   the same layers with one controller per entity.
2. **Contracts describe the screen as well as the request.** `MASTER_DEFINITIONS` lists each table's fields, key
   kind and sortable columns; the admin form and the API validate with the same `MASTER_CREATE_SCHEMAS` /
   `MASTER_UPDATE_SCHEMAS`. Update schemas are built from shapes **without defaults**: a Zod default inside
   `.partial()` still fires, which would silently reset `active` on every PATCH (a test pins this).
3. **Cursor pagination everywhere.** Prisma's native cursor over a stable order (sort field, then key); the cursor
   is the base64url of the last key and means nothing to a client. One extra row is read to know whether another
   page exists. `total` is returned for the table footer. `cursorQuerySchema` and `cursorPageSchema` in
   `packages/contracts` are for every list.
4. **Soft delete only where the table has `deletedAt`.** Specialities, treatments, cities, document types and lost
   reasons are soft-deleted (`DELETE`, `restore`, `?deleted=true`). Countries, languages and currencies are keyed
   by ISO code and referenced everywhere, so they are only deactivated; `DELETE` answers 409 and says so. A
   slug stays taken after a delete so an address is never reused by accident.
5. **Audit and outbox are written in the change's transaction** (`AuditService.record(tx, ...)`,
   `OutboxService.publish(tx, ...)`): the audit row exists if and only if the change does. F-05 adds masking,
   view/download events and the worker that reads the outbox.
6. **Permissions are declared on every route with `@Can(action, subject)`**; a route with neither `@Can` nor
   `@Public()` is refused (fail closed). `can()` lives in `packages/contracts`; F-04 replaces its body with the
   full matrix, and the portal uses the same function to hide buttons.
7. **A stub sign-in stands in for F-03**: `ENABLE_STUB_AUTH=true` lets a request claim a role (header
   `x-stub-role` or the portal's stub cookie). It is off by default and the API **refuses to start** with it on
   when `NODE_ENV=production`. F-03 replaces `StubAuthGuard` and nothing else.
8. **The generated client is part of the build.** `pnpm build` runs `nest build`, exports `openapi.json`, runs
   orval and compiles `packages/api-client` (turbo wires the order), so the portal can import the generated hooks
   and a stale client cannot be committed. The fetcher follows orval 8's contract (`fetch(url, init)` resolving to
   `{ data, status, headers }`, throwing `ApiError` for non-2xx).
9. **Server errors land on fields.** A 400 or 409 carries `errors: [{ path, message }]` (the same shape for Zod
   failures and for conflicts); the form puts each on the field it names.

## Consequences

- OpenAPI quirk: `nestjs-zod` renders a nullable string with no length limit as `{ type: array }`. Nullable
  strings in response schemas therefore carry a `.max()`; a test would not catch it, but orval's validation does.
- The write body is documented loosely in OpenAPI (`{ [key: string]: unknown }`) because it depends on the
  resource; the admin forms use the contracts schemas directly, so they are fully typed.
- Messages from the API are English; the admin screen shows them as they are on the field. Localised API errors
  are not done yet (see `docs/progress.md`).
