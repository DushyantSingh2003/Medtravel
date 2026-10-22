# Open questions and assumptions

Appended by build tasks. Format: `- [<TASK-ID>] <question> — assumed: <what was chosen>`

- [S-01] The plan assumes older majors of Next, Nest, Tailwind, Zod and Prisma than the registry now serves — assumed: used the current stable majors (Next 16, Nest 12, Tailwind 4, Zod 4, Prisma 7), following what the official generators emit.
- [S-01] Nest 12's generator emits oxlint while Next's emits ESLint — assumed: one shared ESLint 9 flat config in `packages/config` for every workspace, because the plan asks for a single shared preset and `eslint-config-next` needs ESLint. ESLint 10 is the registry latest but `eslint-config-next` 16 targets 9.
- [S-01] Prisma's `latest` tag is a release candidate (8.0.0-rc) — assumed: pinned stable 7.10; revisit when 8 is released.
- [S-01] `nestjs-zod` 5.5 declares peer ranges that exclude Nest 12 — assumed: safe to use, since it imports and works (validated by the API e2e test); the peer range is stale. Re-check when it publishes a Nest 12 range.
- [S-01] Tailwind 4 has no JS config, so the plan's "Tailwind preset" — assumed: a shared `theme.css` with an `@theme` block in `packages/ui`.
- [S-01] BullMQ on native ESM cannot lazy-load ioredis from connection options — assumed: the worker passes a constructed `ioredis` client.
- [S-02] MinIO is no longer on Docker Hub — assumed: official `quay.io/minio/minio` and `quay.io/minio/mc` with unpinned `latest` tags; the exact release tags could not be looked up here. Pin them.
- [S-02] The API and worker refuse to start without `.env`, but a fresh clone has none — assumed: `pnpm infra:up` copies each `.env.example` to a gitignored `.env` when missing.
- [S-02] Nest does not load `.env` itself — assumed: the API and worker `dev` scripts run through `node --env-file=.env`.
- [S-03] The plan's `CLAUDE.md` says `pnpm check` includes API e2e and points at `apps/api/src/logger.ts` — assumed: neither is true yet, so the file states what `pnpm check` runs today and the real logger path, and adds a short "Stack notes" section.
- [S-03] The plan's `protect-files.sh` blocks `.env`, which would also block `.env.example` that `CLAUDE.md` tells sessions to edit — assumed: `.env.example` stays editable; `.env` and `.env.*` are blocked.
- [S-03] `docs/progress.md` ticks S-01..S-03 only, per the task, so it does not reflect any deferred verification (S-02's MinIO check) as a tick difference — assumed: deferrals are listed under "Notes and deferred work".
- [S-04] The task asks for CI on pull requests, but the build loop merges into `develop` without one — assumed: CI also runs on pushes to `develop`.
- [S-04] The task asks for images on merge to `main` — assumed: images are also built (not pushed) and boot-tested on every pull request, so a broken Dockerfile fails before merge.
- [S-04] ECS needs a way to pick up new images before Terraform exists (L-05) — assumed: a mutable `:staging` tag plus `update-service --force-new-deployment`, with a commit-tagged image pushed for rollbacks.
- [S-04] The AWS resources and GitHub variables do not exist yet — assumed: the deploy workflow stays dormant until `AWS_ROLE_ARN` is set; names default to `medtravel-staging` / `medtravel-<app>` and can be overridden.
- [S-04] `dump.rdb` (a Redis snapshot holding only a test key from verification) was committed in S-01 by `git add -A` — assumed: remove it and ignore `*.rdb`; it stays in history but contains no secrets.
- [S-05] The task's brand tokens are placeholders (`<colour>`, `<font>`) — assumed: primary clinical blue (continuing S-01), secondary warm amber, Inter for Latin and Noto Sans Arabic for Arabic (IBM Plex Sans Arabic not bundled). One file (`theme.css`) to change.
- [S-05] "Set up shadcn/ui inside packages/ui" — assumed: the shadcn conventions (Radix + class-variance-authority + `cn`, components in place) without its CLI, which needs a registry download; no `components.json`.
- [S-05] TanStack Table 9 and react-day-picker 10 are the registry latest — assumed: use the 8.x and 9.x lines, whose APIs are known, and upgrade deliberately.
- [S-05] Arabic number formatting — assumed: Latin digits for dates, money and phone numbers, because they are compared against invoices and passports; one line (`intlLocale`) to change.
- [S-05] Case stages are needed by StatusBadge/StageTracker before F-10 — assumed: identifiers only in `packages/contracts/src/case-stages.ts`; F-10 adds transitions, owners and durations.
- [S-05] The gallery needs a storage endpoint to demo uploads — assumed: a mock S3 multipart endpoint in the portal, off in production unless `ENABLE_UI_GALLERY=true`.
- [S-05] Components carry no default text — assumed: every visible string is a prop supplied by the app through next-intl.
- [S-05] Dark mode — assumed: tokens and components are dark-ready and tested, but no toggle ships yet.
- [S-05] The S-01 Arabic brand name mixed scripts ("ميدتravel") — assumed: "ميد ترافل"; flagged in `packages/i18n/REVIEW.md`.
- [S-06] Authentication does not exist yet but the portals must redirect by role — assumed: a stub login (pick any of the eleven roles) that sets a cookie holding the role, switched on only by `ENABLE_STUB_AUTH=true`; F-03 replaces it.
- [S-06] Which routes are "the five route groups" — assumed: `/{locale}/patient`, `/ops` (the coordinator portal, PRD section 6), `/hospital`, `/agent`, `/admin`; one role belongs to exactly one portal (PRD section 2).
- [S-06] Whether a role sees only part of its portal (interpreter, finance) — assumed: not yet; every role sees its portal's whole menu until the permission matrix (F-04).
- [S-06] How to show screens that belong to later tasks — assumed: a placeholder page per PRD feature with its priority (launch, phase 2, phase 3); Case 360 is `/ops/cases/CASE-YYYY-NNNNNN`, the rest are flat pages.
- [S-06] The WhatsApp number — assumed: `NEXT_PUBLIC_WHATSAPP_NUMBER` at build time; the button is hidden when it is not set, rather than shipping a fake number.
- [S-06] What the header's "menus" contain — assumed: links to index pages (Treatments, Hospitals, Doctors, Destinations, Cost calculator, About) until the CMS has content for mega-menus.
- [S-06] Currency switcher scope — assumed: USD, EUR, INR, AED stored in a `mt_currency` cookie; nothing reads it until prices are shown (F-09 and the cost calculator).
- [S-06] Logo and favicon — assumed: a placeholder mark (blue square, white cross, amber arc) drawn for this task; replace with the real brand.

- [F-01] Money as `Int` is capped at 21.4 million major units per column — assumed: acceptable for any single payment, quote or line; totals are summed in the application; widen to `BigInt` if a case can exceed it (ADR 002).
- [F-01] Entities beyond the task's list — assumed: added `StaffProfile`, `HospitalStaff`, `Accreditation`, `CaseAttendant`, `CaseStageHistory`, `DocumentShare`, `CommissionRule`, `MessageAttachment`, `StayHospitalDistance`, `NumberSequence` and the translation tables, because PRD sections 5 to 9 need them.
- [F-01] How hospitals get at patient documents — assumed: through `DocumentShare` rows (per document and hospital, revocable, tied to a `Consent`), never a flag on the document.
- [F-01] Generated versus trigger-maintained search columns — assumed: triggers, because Prisma tries to drop the default of a generated column in every later migration.
- [F-01] Seed scope — assumed: master data with Arabic names now; users, hospitals and cases in F-11.
