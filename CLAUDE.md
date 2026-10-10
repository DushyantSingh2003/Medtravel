# MedTravel platform — rules for Claude Code

## What this is
End-to-end medical travel platform: international patients → accredited Indian hospitals, from enquiry to return home.
Requirements: docs/PRD.md (read only the sections a task names). Task list and prompts: docs/BUILD_PLAN.md. Status: docs/progress.md.

## Layout
apps/api (NestJS+Fastify) · apps/worker (BullMQ) · apps/web (Next.js public site) · apps/portal (Next.js: /patient /ops /hospital /agent /admin)
packages/db (Prisma) · contracts (Zod, enums, stage machine, permission matrix) · api-client (orval) · ui · i18n · emails · pdf · config

## Commands
pnpm dev (docker services + all apps) · pnpm check (lint + typecheck + unit tests) · pnpm --filter @medtravel/api test:e2e (API e2e) · pnpm e2e (Playwright)
pnpm db:migrate --name <task-id>-<slug> · pnpm db:seed · pnpm db:studio · pnpm api:generate (after any API change)
Seed logins: see docs/dev-users.md (one user per role, password Dev@12345, 2FA disabled in dev only)

## Stack notes (versions as installed — they differ from older docs and from your training data)
- Next.js 16 + React 19 + Tailwind 4 (CSS-first: tokens in packages/ui/src/theme.css via @theme, no tailwind.config). NestJS 12 (ESM). Zod 4. Prisma 7 (client needs the pg driver adapter; the URL lives in packages/db/prisma7.config.ts, not the schema). TypeScript 6. ESLint 9 flat config from packages/config.
- Node ESM packages and Nest apps import relative files with a `.js` extension; the Next apps import without one (Turbopack does not rewrite it).
- Read `NEXT_PUBLIC_*` variables as literal `process.env.NEXT_PUBLIC_X` — Next only inlines that exact form.
- Shared packages are compiled to dist: after editing one, run `pnpm build` and restart the apps that use it.
- Run what you build. `pnpm check` passing has missed real startup failures before — boot the app and hit it.

## Backend rules
- Module pattern: controller (thin, no logic) → service → Prisma. Request/response schemas come from packages/contracts.
- Every endpoint declares a permission with @Can(action, subject). Data scoping by role lives ONLY in the rbac module.
- Lists: cursor pagination, server-side filters and sorting, select only needed fields, no N+1 (use include/select or batched queries).
- Multi-table writes in a transaction. Side effects (notifications, audit, SLA timers) go through domain events written to the outbox table in the same transaction; the worker processes them.
- Case stage changes ONLY via CaseStageService.transition(), which enforces the state machine in contracts.
- Money: integer minor units + ISO currency code. Quotes store the FX rate snapshot. Never floats.
- Time: store UTC; show in viewer's timezone; ops screens default to Asia/Kolkata.
- Human-readable numbers: CASE-YYYY-NNNNNN, INV/YY-YY/NNNNN, Q-NNNNNN.
- Soft delete business records (deletedAt). Hard delete only through retention jobs.
- Never edit a migration that has been committed; create a new one.

## Security rules (non-negotiable)
- Agents never receive medical documents, diagnosis or bills — only stage and name, and only with patient consent.
- Hospitals see only cases sent to them, and only documents the patient consented to share with them.
- All files are in a private bucket. Downloads via presigned URLs valid ≤ 5 minutes; every view/download writes an audit event.
- Never log PII, medical text, passport numbers or tokens (pino redact list in apps/api/src/logging/logger.options.ts).
- Secrets only via env vars validated in config schema; add new vars to .env.example. Never touch .env files.
- Validate every input with Zod. Rate-limit auth, OTP and public forms. Helmet, CSRF protection for cookie auth, strict CORS.

## Frontend rules
- Use packages/ui components (PageHeader, DataTable, FormField*, FileUploader, StageTracker, EmptyState, ConfirmDialog). Add new shared components there, not in apps.
  Read packages/ui/README.md first. Components hold no text (pass translated strings in), use semantic colour tokens (never bg-white/text-slate-*), and are checked in `/ui-gallery` — add new ones there with en and ar.
- RTL-safe Tailwind only: ms-/me-/ps-/pe-/start-/end-, never ml-/mr-/pl-/pr-/left-/right-.
- All visible text via next-intl keys. Add en and ar for every key (mark machine-drafted ar in packages/i18n/REVIEW.md).
- Data only through generated api-client hooks. Every screen has loading skeleton, error state and empty state.
- Forms: React Hook Form + zodResolver(contract schema). Show server validation errors on the right field.
- apps/web: server components by default, static generation/ISR, next/image, no client JS unless interactive.
- apps/portal: lists over 50 rows are virtualised; heavy widgets (charts, editor, video, maps) are dynamically imported; mutations use optimistic updates where safe.
- Mobile-first: every portal screen must work at 360 px width.

## Testing rules
- Service logic: Vitest unit tests. Every endpoint: API e2e test against Testcontainers Postgres, including one forbidden-role test.
- New user-facing flows: Playwright test. Never skip, delete or weaken a test to make it pass.
- A task is done only when pnpm check is green.

## Workflow
- Plan first, wait for approval, then implement. Ask when the PRD is ambiguous instead of guessing.
- Follow existing patterns; look at the most similar existing module before creating something new.
- Explain any new dependency in the plan. Prefer what is already installed.
- Commit message: <TASK-ID>: <summary>. Update docs/progress.md at the end of every task.
- Record important decisions as short ADRs in docs/decisions/NNN-title.md.
- No `any`, no business logic in controllers or React components, no commented-out code.
