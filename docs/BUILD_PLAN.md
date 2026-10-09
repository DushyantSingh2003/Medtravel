# Medical Tourism Platform — Claude Code Build Plan

Oct 9, 2026 · @Dushyant CatFin

## 1. How this plan works

You build the whole platform as 116 small tasks. Each task is one Claude Code prompt and one Git commit, takes 30 minutes to a few hours, and is tested before you start the next one. Task IDs (S-01, F-03, C-08…) map to sections of the PRD, so nothing in the PRD is left without a task. Small tasks are the single biggest speed factor: Claude Code is fast and accurate on a focused change, slow and error-prone on "build the whole portal".

**The build loop for every task**

1. Start a fresh Claude Code session in the repo root (or run `/clear`), so old context doesn't confuse the new task.
2. Paste the task prompt, e.g. `/task C-08 Quote builder …`. The `/task` skill (section 5) wraps every prompt with the same rules: read CLAUDE.md and the PRD section, plan first, write tests, run checks, update progress.
3. Claude Code shows its plan. Read it. Correct it if it misunderstood the PRD. Approve.
4. Claude Code implements, writes tests and runs `pnpm check` (lint + type-check + tests).
5. Run `/review-task` to get an independent review from the code-reviewer subagent; for anything touching patient data, auth or money also run `/security-check`.
6. Click through the feature yourself in the browser (2–5 minutes). This catches what tests miss.
7. Commit, push, and let CI deploy to staging. Tick the task in `docs/progress.md`.

**Rules that keep it fast**

- Do the phases in order. Foundation tasks (Phase 1A) are used by every later module; skipping ahead creates rework.
- Inside one phase, tasks in different modules can run in parallel in separate Git worktrees (section 20) if you have two developers or two sessions.
- Never let a session run past one task. When the context gets long, commit and `/clear`.
- If Claude Code goes wrong twice on the same task, stop, `git restore` the changes, split the task smaller and try again.
- Every prompt below is written to be pasted as-is. Text in angle brackets like `<your brand>` is for you to fill in.

## 2. Timeline

The MVP (every P0 feature in the PRD) goes live after about 16 weeks with one or two developers working full-time with Claude Code; Phase 2 runs in months 5–8 and Phase 3 in months 9–12. Admin, finance and logistics tasks (1G) run alongside the other modules because those modules depend on them.

*(Diagram in the build plan doc: MVP timeline · 8 workstreams over 16 weeks)*

**Order dependencies to respect:** build LG-01 to LG-04 before C-12, FI-02 before P-05, AD-04 before W-02, and finish all of Phase 1A before any module task. Week ranges are estimates; your real pace will show after Phase 1A, so re-plan then.

## 3. Architecture and repo structure

One TypeScript monorepo with four deployable apps: the API, a background worker, the public website, and one portal app that holds all five logged-in portals as role-based sections. Building the five portals as one app instead of five is the biggest time saver in this plan: login, layout, tables, forms, chat and file upload are built once and reused everywhere. Shared Zod schemas give end-to-end types, so the front end and API can never drift apart.

*(Diagram in the build plan doc: runtime architecture · 4 apps, 3 data stores, providers via the worker)*

This is why the platform feels fast: visitors get pages straight from the CDN, files never pass through the API, and anything that waits on WhatsApp, email, PDFs or scans happens in the worker while realtime pushes the result to the screen.

**Domains:** `www.<brand>.com` (website) · `app.<brand>.com` (all portals) · `api.<brand>.com` (API + WebSocket) · `files.<brand>.com` (CloudFront for public images only; medical files always via signed links).

```text
medtravel/
├─ apps/
│  ├─ api/          NestJS (Fastify) REST API + Socket.IO gateway
│  │  └─ src/modules/  auth, users, rbac, audit, files, notifications, masters,
│  │                  patients, cases, opinions, quotes, visa, bookings, logistics,
│  │                  messaging, tasks, hospitals, doctors, packages, agents,
│  │                  commissions, payments, invoices, refunds, cms, reports, public
│  ├─ worker/       BullMQ processors: notifications, pdf, virus-scan, sla-timers,
│  │                 reminders, fx-rates, retention, reports-export
│  ├─ web/          Next.js public website (SSG/ISR, next-intl, SEO)
│  ├─ portal/       Next.js app: /patient /ops /hospital /agent /admin route groups
│  └─ mobile/       Expo app (Phase 2): patient + ground-coordinator modes
├─ packages/
│  ├─ db/           Prisma schema, migrations, seed, test factories
│  ├─ contracts/    Zod schemas, enums, case stage machine, permission matrix
│  ├─ api-client/   Generated typed client + TanStack Query hooks (orval)
│  ├─ ui/           Design system: Tailwind preset, shadcn/ui components, DataTable,
│  │                 Form, FileUploader, StageTracker, ChatPanel, RTL support
│  ├─ i18n/         Message catalogues en, ar, ru, fr (+ later)
│  ├─ emails/       React Email templates
│  ├─ pdf/          Quote, invoice, welcome pack, statement PDF templates
│  └─ config/       eslint, tsconfig, prettier, vitest presets
├─ infra/           docker-compose (local), Terraform (AWS ap-south-1)
├─ docs/            PRD.md, BUILD_PLAN.md, progress.md, decisions/ (ADRs), api.md
├─ e2e/             Playwright end-to-end tests (full patient journey)
└─ .claude/         CLAUDE.md lives at repo root; skills/, agents/, hooks/, settings.json
```

| Layer | Choice | Why it is fast to build and fast to run |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | One repo Claude Code can see whole; cached builds and tests |
| API | NestJS on Fastify adapter, nestjs-zod, OpenAPI | Clear module pattern Claude Code repeats well; Fastify is \~2× Express throughput |
| ORM / DB | Prisma + PostgreSQL 16, pg\_trgm + full-text search | Type-safe queries, migrations; no separate search engine at MVP |
| Validation / types | Zod in `packages/contracts`, shared by API and UI | One schema = API validation + form validation + types |
| API client | orval generates TanStack Query hooks from OpenAPI | No hand-written fetch code; caching and refetching built in |
| Queues / jobs | Redis + BullMQ in `apps/worker` | Slow work (WhatsApp, PDFs, scans) never blocks a request |
| Realtime | Socket.IO with Redis adapter | Live chat, case updates and notifications in portals |
| Website | Next.js App Router, static generation + ISR, next/image | Pages served from CDN; top Core Web Vitals and SEO |
| Portal | Next.js App Router, client components + TanStack Query/Table, React Hook Form | Snappy SPA-like feel, virtualised tables, optimistic updates |
| UI | Tailwind + shadcn/ui + lucide icons, RTL via logical CSS properties | Claude Code generates these components fluently |
| i18n | next-intl (UI text) + translation tables (DB content) | Arabic RTL from day one |
| Auth | Own module: argon2 passwords, OTP (email/SMS/WhatsApp), TOTP 2FA, httpOnly cookie sessions with refresh rotation | Full control over 11 roles and 5 portals on one domain |
| Permissions | CASL abilities from one permission matrix in `contracts` | Same rules checked in API and used to hide UI |
| Files | S3 presigned multipart upload (Uppy), ClamAV scan, pdf-lib watermark | 500 MB uploads go straight to S3, not through the API |
| PDFs | @react-pdf/renderer in worker | Branded quotes, invoices, statements |
| Email | React Email + Amazon SES | Templates in code, versioned |
| Testing | Vitest, Testcontainers (real Postgres), Playwright, MSW | Claude Code can run every test locally |
| Infra | Docker; AWS ECS Fargate, RDS, ElastiCache, S3, CloudFront, SES; Terraform | India data residency; infra as code Claude Code can write |
| Observability | Sentry, pino JSON logs → CloudWatch, uptime checks | Errors visible in minutes |

## 4. Before you start (human tasks)

Start these in week 1, because several approvals take 2–6 weeks and Claude Code cannot do them for you. Everything else in this plan can proceed while you wait; integrations are built against sandbox accounts first.

**Your machine**

- [ ] Node.js 22 LTS, pnpm 9+, Docker Desktop, Git, GitHub CLI (`gh`), `jq` (needed by hooks)
- [ ] Claude Code installed and logged in; VS Code or Cursor with the Claude Code extension (optional)
- [ ] A paid Claude plan with enough usage for daily heavy coding

**Company and legal**

- [ ] Brand name, domain(s), logo, colours and fonts decided
- [ ] Company registration, GST, current account, Import Export Code (for foreign receipts)
- [ ] Lawyer engaged for: privacy policy, terms, refund policy, medical disclaimer, DPDP compliance, hospital agreement, agent agreement
- [ ] Grievance officer named (needed on the website)

**Accounts (create now, sandbox first)**

- [ ] GitHub organisation + private repo `medtravel`
- [ ] AWS account (ap-south-1 Mumbai), billing alerts, IAM user for Terraform; request SES production access early
- [ ] Meta Business Manager verification + WhatsApp Business API via a BSP (Gupshup / Interakt / WATI); dedicated phone number; template approvals (allow 2–4 weeks)
- [ ] Payment gateway with international cards enabled (Razorpay international and/or Stripe), KYC done; PayPal optional
- [ ] SMS provider (MSG91 or Twilio) with DLT registration for India
- [ ] Google Cloud project: Maps JavaScript + Places API keys, Translation API (Phase 2)
- [ ] Sentry account, Google Analytics 4 property, Meta Pixel, Google Search Console
- [ ] Exchange-rate API key (Open Exchange Rates or similar)
- [ ] Phase 2: video provider (100ms / Agora / Daily), cloud telephony (Exotel), e-sign (Leegality / Digio), Zoho Books, Apple and Google developer accounts

**Business inputs Claude Code will need**

- [ ] List of launch hospitals, doctors and packages (spreadsheet) for seeding
- [ ] First 3 source countries, languages and specialities
- [ ] Commission % per hospital, agent commission plans, service package prices
- [ ] Visa document checklist per target nationality
- [ ] Brand voice and 10 approved WhatsApp message templates per language

## 5. Claude Code setup

These files make every session follow the same rules without you repeating them: `CLAUDE.md` is read at the start of every session, skills become your own slash commands, subagents give an independent second opinion, and hooks run formatting and safety checks automatically. Task S-03 creates all of them; the full contents are below so you can review them first. Feature details come from the [Claude Code docs](https://code.claude.com/docs/en/overview).

**Docs to put in the repo first:** export the PRD doc as Markdown to `docs/PRD.md`, export this plan to `docs/BUILD_PLAN.md`. Claude Code creates `docs/progress.md` in task S-03.

### 5.1 CLAUDE.md (repo root)

```markdown
# MedTravel platform — rules for Claude Code

## What this is
End-to-end medical travel platform: international patients → accredited Indian hospitals, from enquiry to return home.
Requirements: docs/PRD.md (read only the sections a task names). Task list and prompts: docs/BUILD_PLAN.md. Status: docs/progress.md.

## Layout
apps/api (NestJS+Fastify) · apps/worker (BullMQ) · apps/web (Next.js public site) · apps/portal (Next.js: /patient /ops /hospital /agent /admin)
packages/db (Prisma) · contracts (Zod, enums, stage machine, permission matrix) · api-client (orval) · ui · i18n · emails · pdf · config

## Commands
pnpm dev (all apps + docker services) · pnpm check (lint + typecheck + unit + api e2e) · pnpm e2e (Playwright)
pnpm db:migrate --name <task-id>-<slug> · pnpm db:seed · pnpm db:studio · pnpm api:generate (after any API change)
Seed logins: see docs/dev-users.md (one user per role, password Dev@12345, 2FA disabled in dev only)

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
- Never log PII, medical text, passport numbers or tokens (pino redact list in apps/api/src/logger.ts).
- Secrets only via env vars validated in config schema; add new vars to .env.example. Never touch .env files.
- Validate every input with Zod. Rate-limit auth, OTP and public forms. Helmet, CSRF protection for cookie auth, strict CORS.

## Frontend rules
- Use packages/ui components (PageHeader, DataTable, FormField*, FileUploader, StageTracker, EmptyState, ConfirmDialog). Add new shared components there, not in apps.
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
```

### 5.2 Skills (your slash commands)

`.claude/skills/task/SKILL.md` — used for every task in this plan:

```markdown
---
name: task
description: Implement one build-plan task end to end with plan, tests and checks
disable-model-invocation: true
argument-hint: <TASK-ID> <task details>
---
Implement this build task: $ARGUMENTS

1. Re-read the rules in CLAUDE.md. Find the task ID in docs/BUILD_PLAN.md and read the PRD sections it names in docs/PRD.md. Read docs/progress.md to see what exists. Open the most similar existing module and follow its pattern.
2. Write a plan: data model changes, API endpoints (method, path, permission), events and notifications, UI screens and components, i18n keys, tests. List PRD ambiguities as questions. STOP and wait for my approval.
3. After approval, implement in small steps. Migrations via pnpm db:migrate --name <task-id>-<slug>. Run pnpm api:generate after API changes. Extend seed data so the feature can be tried immediately.
4. Write the tests required by CLAUDE.md.
5. Run pnpm check and fix until green.
6. Update docs/progress.md (tick task, list anything deferred) and docs/api.md if endpoints changed.
7. Summarise what changed and give me exact steps to try it (URL, seed user). Suggest a commit message. Do not commit until I say so.
```

`.claude/skills/review-task/SKILL.md`:

```markdown
---
name: review-task
description: Independent review of uncommitted changes before commit
disable-model-invocation: true
---
Use the code-reviewer subagent to review all uncommitted changes (git diff plus untracked files) against CLAUDE.md and the PRD sections for the current task. Then show its findings grouped High / Medium / Low, fix every High and Medium finding, and re-run pnpm check.
```

`.claude/skills/security-check/SKILL.md`:

```markdown
---
name: security-check
description: Security and privacy review of uncommitted changes touching patient data, auth, files or money
disable-model-invocation: true
---
Use the security-reviewer subagent on all uncommitted changes. Fix every Critical and High finding, add a test that proves each fix, and re-run pnpm check. List any finding you did not fix and why.
```

`.claude/skills/scaffold-module/SKILL.md` — speeds up every new entity:

```markdown
---
name: scaffold-module
description: Scaffold a full CRUD vertical slice for one entity following the reference module
disable-model-invocation: true
argument-hint: <EntityName> <portal route> <fields and permissions>
---
Create a vertical slice for: $ARGUMENTS
Follow apps/api/src/modules/masters exactly as the reference pattern.
1. Zod schemas + types in packages/contracts. 2. Prisma model + migration (if missing). 3. NestJS module: controller, service, permissions, list with cursor pagination + filters + search, get, create, update, soft delete, audit events. 4. API e2e tests incl. forbidden role. 5. pnpm api:generate. 6. Portal list page (DataTable with filters, search, column sort), detail/edit page, create dialog, using packages/ui. 7. en + ar i18n keys. 8. Seed 5 realistic records. 9. pnpm check.
Show the plan first and wait for approval.
```

### 5.3 Subagents

`.claude/agents/code-reviewer.md`:

```markdown
---
name: code-reviewer
description: Reviews uncommitted changes for correctness, PRD fit, patterns, performance and tests. Use before every commit.
tools: Read, Glob, Grep, Bash
model: inherit
---
You are a senior TypeScript reviewer for a medical-travel platform. Review the uncommitted changes (run git diff and git status). Check:
1. Does it fully meet the PRD section and the task, nothing missing, nothing extra?
2. CLAUDE.md rules: module pattern, permissions on every endpoint, stage machine, money as minor units, RTL-safe classes, i18n keys, ui components.
3. Correctness: edge cases, null handling, transactions, race conditions, timezone errors.
4. Performance: N+1 queries, missing indexes for new filters, unpaginated lists, large client bundles, unnecessary client components.
5. Tests: forbidden-role test present, meaningful assertions, no skipped tests.
6. UX: loading, error, empty states; mobile width; accessible labels.
Report findings as High / Medium / Low with file:line and a concrete fix. Do not edit files.
```

`.claude/agents/security-reviewer.md`:

```markdown
---
name: security-reviewer
description: Security and privacy reviewer for changes touching patient data, documents, auth, permissions, payments or webhooks.
tools: Read, Glob, Grep, Bash
model: inherit
---
You are an application security engineer. The platform stores medical records and passports of foreign patients and must meet India's DPDP Act. Review the uncommitted changes for:
- Broken access control: can any role (especially agent, hospital, patient) read or change data outside its scope? Check IDs taken from the request.
- Data exposure: PII or medical data in logs, errors, URLs, analytics events, emails to the wrong person.
- Files: public URLs, long-lived signed URLs, missing virus scan, missing audit of downloads.
- Auth: session handling, OTP brute force, 2FA bypass, password reset flaws, CSRF.
- Injection and validation: raw SQL, unvalidated input, unsafe HTML (rich text must be sanitised).
- Payments and webhooks: signature verification, idempotency, amount tampering, currency mix-ups.
- Secrets in code; dependency risk.
Report Critical / High / Medium / Low with file:line, an exploit scenario, and the fix. Do not edit files.
```

### 5.4 Hooks and settings

`.claude/settings.json` — formats every edited file with Prettier and blocks edits to secrets and Git internals:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write --ignore-unknown" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh" }]
      }
    ]
  }
}
```

`.claude/hooks/protect-files.sh` (make it executable with `chmod +x`): reads the file path from the hook input with `jq -r '.tool_input.file_path // empty'` and exits with code 2 when it matches `.env`, `.git/` or `pnpm-lock.yaml`. Use `/permissions` inside Claude Code to always allow `pnpm`, `git status/diff/add/commit`, `docker compose` and `npx prisma` commands so you aren't asked every time.

### 5.5 MCP servers (optional but faster)

- **Playwright MCP** so Claude Code can open the app, click through a flow and see the result: `claude mcp add playwright -- npx @playwright/mcp@latest`
- **Context7** for current library docs (Next.js, NestJS, Prisma versions change fast): add from its README.
- **Sentry MCP** after launch, so Claude Code can read production errors when fixing bugs.
- Check each server's README for the current install command; see [Claude Code MCP docs](https://code.claude.com/docs/en/mcp).

## 6. Phase 0 — Scaffold (week 1)

Six tasks create an empty but fully wired project: every app starts, tests run, CI deploys, and the design system exists. S-01 to S-03 are pasted as plain prompts because the `/task` skill doesn't exist yet; from S-04 on, every prompt starts with `/task`.

**S-01 Monorepo scaffold**

```text
Create a pnpm + Turborepo monorepo named medtravel following the layout in docs/BUILD_PLAN.md section 3 (apps: api, worker, web, portal; packages: db, contracts, api-client, ui, i18n, emails, pdf, config). Use TypeScript strict everywhere, Node 22.
- apps/api: NestJS with Fastify adapter, nestjs-zod, Swagger/OpenAPI at /docs, pino logging with PII redaction, Helmet, CORS, config module validating env with Zod, /health endpoint.
- apps/worker: NestJS standalone app with BullMQ, one example queue.
- apps/web and apps/portal: Next.js App Router with Tailwind, next-intl (en, ar) and RTL switching by locale.
- packages/db: Prisma with PostgreSQL, empty schema, scripts db:migrate, db:seed, db:studio.
- packages/config: shared eslint, prettier, tsconfig, vitest presets.
- Root scripts: dev, build, check (lint + typecheck + test), e2e, api:generate.
Add .env.example for every app. Make sure pnpm install && pnpm check passes. Show the plan first.
```

Done when: `pnpm check` is green and `pnpm build` builds all apps.

**S-02 Local services with Docker**

```text
Add infra/docker-compose.yml for local development: PostgreSQL 16 (with pg_trgm and unaccent extensions), Redis 7, MinIO (S3-compatible, with a private bucket "medtravel-private" and public bucket "medtravel-public" auto-created), Mailpit (email catcher), and ClamAV. Wire env vars in .env.example. Make `pnpm dev` start the containers, wait until healthy, then run all apps in parallel with Turborepo. Add a README "Getting started" section with exact commands and the local URLs of every app and service.
```

Done when: a fresh clone runs with `pnpm i && pnpm dev` and all URLs open.

**S-03 Claude Code configuration and progress tracker**

```text
Create the Claude Code configuration exactly as written in docs/BUILD_PLAN.md section 5: CLAUDE.md at the repo root, .claude/skills (task, review-task, security-check, scaffold-module), .claude/agents (code-reviewer, security-reviewer), .claude/settings.json hooks and .claude/hooks/protect-files.sh (executable). Then create docs/progress.md: a checklist of every task ID and title in docs/BUILD_PLAN.md grouped by phase, all unticked except S-01..S-03. Create docs/decisions/001-architecture.md summarising the stack choices from BUILD_PLAN section 3, and docs/dev-users.md as a placeholder.
```

Done when: `/task` appears in the slash menu and a test edit gets auto-formatted.

**S-04 CI pipeline and staging deploy**

```text
/task S-04 GitHub Actions CI and staging deploy. On every pull request: install with pnpm cache, Turborepo remote/local cache, lint, typecheck, unit tests, API e2e tests with a Postgres service container, build all apps, Playwright smoke test. On merge to main: build Docker images for api, worker, web, portal (multi-stage, non-root, small images), push to Amazon ECR, deploy to the staging ECS services. Write the Dockerfiles. Add a PR template with a checklist (task ID, tests, screenshots, migration?). Add Dependabot for npm and GitHub Actions. Terraform for AWS comes later in L-05; for now document the required GitHub secrets in docs/deploy.md.
```

Done when: a test PR runs the whole pipeline green.

**S-05 Design system (packages/ui)**

```text
/task S-05 Design system in packages/ui. Brand tokens: primary <colour>, secondary <colour>, font <font> (Latin) + Noto Sans Arabic / IBM Plex Sans Arabic for Arabic; light theme first, dark-ready CSS variables. Set up shadcn/ui inside packages/ui and export: Button, Input, Textarea, Select, Combobox, DatePicker, PhoneInput (with country codes), CurrencyInput, Checkbox, Radio, Switch, Badge, StatusBadge (case stages), Card, Tabs, Dialog, Sheet, Drawer, Toast, Tooltip, DropdownMenu, Avatar, Skeleton, EmptyState, ErrorState, PageHeader, Breadcrumbs, ConfirmDialog, DataTable (TanStack Table + virtualisation, server-side pagination/sort/filter, column visibility, row selection, CSV export), FormField wrappers for React Hook Form, FileUploader (Uppy, multipart to S3 presigned URLs, progress, resume, 500 MB limit, type filter), StageTracker (12-stage horizontal/vertical progress), Timeline, ChatPanel (message list, composer, attachments), KPI StatCard, KanbanBoard (dnd-kit). All RTL-safe and keyboard accessible. Add a /ui-gallery page in apps/portal showing every component in en and ar.
```

Done when: the gallery shows every component correctly in English and Arabic at 360 px and desktop widths.

**S-06 App shells and layouts**

```text
/task S-06 App shells. apps/portal: authenticated layout with collapsible sidebar, top bar (search, notifications bell, language switcher, user menu), and five route groups /patient, /ops, /hospital, /agent, /admin, each with its own navigation config and placeholder pages for every screen named in PRD sections 5.2, 6, 7, 8 and 9. Role-based redirect after login (stub auth for now). apps/web: public layout with header (logo, menus for Treatments, Hospitals, Doctors, Destinations, Cost Calculator, About), language and currency switcher, WhatsApp floating button, footer with link columns and legal links. Both apps: 404 and error pages, loading states, SEO metadata defaults, favicon set.
```

Done when: you can click through every placeholder page of every portal.

## 7. Phase 1A — Foundation (weeks 2–4)

Twelve tasks build the parts every portal depends on: data model, login, permissions, audit, files, notifications, realtime, money and languages, and the case stage machine. Get these right and every later module is mostly screens and business rules. Run `/security-check` after F-03, F-04, F-05 and F-06.

**F-01 Database schema**

```text
/task F-01 Full Prisma schema for every entity in PRD section 11: User, Session, Patient, Attendant, Case, Document, MedicalSummary (versioned), Hospital, HospitalBranch, Department, Doctor, Package, OpinionRequest, Opinion, Quote, QuoteLine, Payment, Invoice, InvoiceLine, CreditNote, Refund, VisaApplication, Booking (type: flight, stay, transfer, interpreter, sim, other), Stay, StayRoom, Vendor, Driver, Vehicle, Interpreter, Agent, AgentUser, CommissionPlan, Commission, Payout, Task, Message, Conversation, Notification, Feedback, Incident, Consent, AuditEvent, OutboxEvent, plus master tables (Country, Language, Currency, FxRate, Treatment, Speciality, City, DocumentType, LostReason) and translation tables for DB content (e.g. TreatmentTranslation). Use UUID primary keys, createdAt/updatedAt/deletedAt, money as Int minor units + currency, enums from packages/contracts. Add indexes for every foreign key and every column we filter or sort by in PRD screens (case stage, owner, country, treatment, hospital, agent, dates). Add a full-text search column + GIN index for hospitals, doctors, treatments and patients (name, phone, passport). Write docs/data-model.md with an entity list and relations.
```

Done when: migration applies cleanly on an empty database and `docs/data-model.md` exists.

**F-02 Master data module (the reference pattern)**

```text
/task F-02 Master data module: countries, languages, currencies, treatments, specialities, cities, document types, lost reasons — API CRUD + admin screens in /admin/masters. This module is the reference pattern that /scaffold-module copies, so make it exemplary: thin controller, service, contracts schemas, cursor pagination, filters, search, soft delete, permissions, audit events, e2e tests incl. forbidden role, DataTable list page, edit sheet, create dialog, en+ar keys. Seed: all countries with ISO codes and dialling codes, 10 languages, currencies USD EUR GBP INR AED SAR OMR IQD UZS KES NGN, 60 common treatments grouped by speciality, 25 specialities, 15 Indian cities, document types, the lost reasons from PRD section 3.
```

Done when: an admin can add a treatment in English and Arabic and it appears in the list instantly.

**F-03 Authentication**

```text
/task F-03 Authentication module (PRD sections 5.2 and 12). Sign-up and login with email+password or phone/email OTP (OTP via email now; SMS and WhatsApp channels plug in at F-07). argon2id password hashing, httpOnly secure SameSite cookies, short-lived access token + rotating refresh token stored hashed in Session table, device list and "log out other sessions". TOTP 2FA (otplib) with QR enrolment and 10 backup codes, mandatory for staff, hospital and admin roles, optional for patients and agents. Forgot/reset password, email verification, account lockout after 5 failed attempts, rate limits on login/OTP endpoints, CSRF protection. Invitation flow (admin invites staff; hospital invites its users; patient invites attendants) with expiring signed links. Magic-link login for doctors (single case scope, 72-hour expiry). Portal pages: login, OTP, 2FA challenge, 2FA setup, forgot, reset, accept invitation, account security settings. Auth guard and @CurrentUser decorator for the API.
```

Done when: each seed role can log in and lands on its own portal; staff cannot skip 2FA.

**F-04 Roles, permissions and data scoping**

```text
/task F-04 RBAC with CASL for the 11 roles in PRD section 2: patient, attendant, agent (owner + sub-user), case manager, ground coordinator, interpreter, hospital desk, doctor, medical reviewer, finance, super admin. Define one permission matrix in packages/contracts (role × subject × action, plus field-level rules) used by both the API guard (@Can) and the portal (useCan hook to hide buttons/menus). Data scoping in one place: case managers see their own + team cases (managers see all), ground coordinators see cases in their city with arrival in ±30 days, hospital users see only cases sent to their hospital, doctors only cases assigned to them, agents only their referrals and never medical data, patients only their own cases, attendants only cases they are invited to. Write a table-driven test suite covering every role against every subject. Generate docs/permissions.md from the matrix.
```

Done when: the permission test suite passes and an agent account gets 403 on any document endpoint.

**F-05 Audit log and domain events**

```text
/task F-05 Audit log and transactional outbox. AuditEvent records actor, role, action, entity type/id, before/after diff (sensitive fields masked), IP, user agent, request ID, timestamp. Write audit events automatically for every create/update/delete and explicitly for every view or download of a patient record or document. Domain events: services write OutboxEvent rows in the same transaction; the worker polls/streams and dispatches to handlers (notifications, SLA timers, search index refresh) with retries and idempotency keys. Admin screen /admin/audit with filters (user, entity, action, date) and export; alert rule: one user downloading more than 50 documents in an hour creates an Incident and notifies admins.
```

Done when: viewing a patient document shows up in the audit screen within seconds.

**F-06 Secure file service**

```text
/task F-06 File service (PRD sections 5.1, 5.2, 12). Presigned multipart upload straight from the browser to the private S3/MinIO bucket via the FileUploader component (resumable, up to 500 MB, allowed types PDF, JPG, PNG, HEIC, DOCX, ZIP of DICOM). On completion the API creates a Document (type, owner case/patient, uploadedBy, visibility) in status "scanning"; the worker scans with ClamAV, marks clean or quarantined, extracts page count and generates image thumbnails/PDF previews. Downloads only through an endpoint that checks permission and consent, writes an audit event and returns a presigned URL valid 5 minutes. Watermark downloaded PDFs and images with viewer name, date and case number (pdf-lib / sharp). Document list component with type tags, preview, download, share-with-hospital toggles (patient consent) and delete (soft).
```

Done when: a 300 MB ZIP uploads with progress, gets scanned, and only permitted roles can download it.

**F-07 Notification engine**

```text
/task F-07 Notification engine (PRD section 10). Channels: email (React Email + SES/Mailpit), SMS (MSG91/Twilio adapter), WhatsApp Business (BSP adapter with approved template names + variables, session messages within 24 h window), in-app (Notification table + bell dropdown + realtime push). A NotificationService.send(eventKey, recipients, data) looks up templates per event, channel and language, renders, queues one job per channel, retries with backoff, logs delivery status (sent, delivered, read, failed via provider webhooks). User preferences per channel. Template registry seeded with every event listed in PRD section 10 (patient, internal, agent) in en and ar. Dev mode: all channels go to Mailpit and a /admin/notifications/log page. Provider adapters behind an interface so we can switch BSP or SMS provider by config.
```

Done when: firing a test event sends email + in-app (+ WhatsApp in sandbox) in the recipient's language and shows in the log.

**F-08 Realtime gateway**

```text
/task F-08 Socket.IO gateway in apps/api with Redis adapter (works across multiple API instances), cookie-authenticated connections, rooms per user, per case and per hospital, permission check on join. Events: notification.created, case.updated, message.created, task.assigned, typing. Portal hook useRealtime that invalidates the matching TanStack Query caches when events arrive, so screens update without refresh. Reconnect with backoff and missed-event catch-up via a since timestamp.
```

Done when: two browsers on the same case see each other's changes live.

**F-09 Money, currencies and languages**

```text
/task F-09 Money and localisation utilities. packages/contracts: Money type (minor units + currency), add/multiply/allocate helpers without floats, formatMoney per locale. FX: worker job every day at 06:00 IST fetches rates from the configured provider into FxRate; convert(amount, from, to, date); quotes snapshot the rate used. Currency switcher on the website stores choice in a cookie. Localisation: locale detection (cookie > Accept-Language > country), Arabic RTL, date/number formatting per locale, timezone handling helpers (UTC in DB, user timezone in UI, Asia/Kolkata default for ops). DB-content translation helper: getTranslated(entity, locale) with English fallback.
```

Done when: a price shows correctly in INR, USD and AED, in English and Arabic.

**F-10 Case core and stage machine**

```text
/task F-10 Case core (PRD section 3). Define the case state machine in packages/contracts: the 12 stages, exit stages (Lost, On hold, Cancelled), the status values listed in PRD section 3, allowed transitions, required data per transition (e.g. Quote sent needs an accepted-able quote; Lost needs a lost reason; Won needs a deposit or manual override with reason), owner role per stage and target duration per stage (configurable in admin). CaseStageService.transition() validates, writes the stage history, emits case.stage_changed, starts/stops SLA timers in the worker, and creates auto-tasks configured per stage (e.g. Visa approved → "Book airport pickup" for ground coordinator). Case numbers CASE-YYYY-NNNNNN. API: create case, get, list (filters), transition, history. Unit tests for every allowed and forbidden transition.
```

Done when: the full transition test matrix passes.

**F-11 Seed data and test factories**

```text
/task F-11 Realistic seed and factories. One dev user per role (docs/dev-users.md), 3 hospitals in Delhi, Mumbai and Chennai with departments, 15 doctors and 30 packages, 3 agents in Iraq, Uzbekistan and Kenya, 40 patients with cases spread across every stage including lost ones, documents (sample PDFs), opinions, quotes, payments, visa applications, bookings, tasks and messages. Factories in packages/db/test for tests. A `pnpm db:reset` command that drops, migrates and seeds. Seed is idempotent and runs in under 30 seconds.
```

Done when: every portal shows believable data after `pnpm db:reset`.

**F-12 Observability**

```text
/task F-12 Observability. Sentry in api, worker, web and portal (source maps, release tagging, PII scrubbing). Request ID on every request propagated to logs, jobs and Sentry. Structured pino logs with redaction. Prometheus-style /metrics (request latency histogram, queue depth, job failures). Health checks: liveness and readiness (DB, Redis, S3). Slow query logging above 200 ms. Bull Board admin UI for queues at /admin/queues (super admin only).
```

Done when: a thrown test error appears in Sentry with request ID and no PII.

## 8. Phase 1B — Coordinator CRM (weeks 5–7)

Fourteen tasks build the operations portal at `/ops`, the tool your team uses all day (PRD section 6). Build it before the patient and hospital portals, because both of those are views onto what coordinators manage here. Ask one of your real coordinators to try each screen as it lands.

**C-01 Lead capture and duplicate detection**

```text
/task C-01 Lead capture (PRD 6: Lead inbox). One LeadIntakeService used by every source: website quote form, WhatsApp inbound message, agent referral, email, manual entry by staff, phone call. Captures source, UTM campaign, referrer, agent code, country, language, treatment, raw message. Duplicate detection by normalised phone, email and passport number (fuzzy name match as a hint): on a match, attach to the existing patient and show a "possible duplicate" banner with merge action (merge patients keeps all history, audited). Creates Patient + Case in stage New. Public endpoint for the website form with captcha (Cloudflare Turnstile) and rate limit.
```

Done when: the same phone number submitted twice creates one patient with two enquiries flagged.

**C-02 Auto-assignment and SLA timers**

```text
/task C-02 Assignment rules and SLAs (PRD 6: Auto-assignment). Admin-configurable rules in /admin/assignment: match on language, country, treatment speciality and source, then round-robin among available case managers (respect working hours, leave, max open cases). Manual reassign with reason. SLA policy per stage from F-10 (e.g. first contact 2 h, quote 48 h): worker timers create warnings at 75% and breaches at 100%, notify owner and manager, and log breaches for reports. Working-hours calendar (IST, holidays) used for SLA maths. Visible countdown chip on every case card and row.
```

Done when: a new Arabic lead from Iraq is assigned within seconds to an Arabic-speaking manager and shows its SLA countdown.

**C-03 Lead inbox and case pipeline**

```text
/task C-03 Ops home, lead inbox and pipeline (PRD 6: Lead inbox, Case pipeline). /ops/inbox: unassigned and new leads with source icons, SLA chip, quick actions (assign to me, call, WhatsApp, mark spam). /ops/cases: list view (DataTable) and Kanban view by stage with drag-to-transition (calls the stage machine; opens a dialog when a transition needs data). Filters: stage, status, owner, team, country, treatment, hospital, agent, source, date ranges, SLA breached; saved views per user; global search by name, phone, passport, case number. Bulk actions: reassign, add tag, export. Counters per stage. Live updates via realtime.
```

Done when: dragging a card to Lost asks for a reason and every other viewer sees it move.

**C-04 Case 360 view**

```text
/task C-04 Case 360 page /ops/cases/[id] (PRD 6: Case 360). Header: patient name, flag, age, case number, StageTracker, owner, SLA chip, primary actions for the current stage. Tabs: Overview (key facts, next actions, stage history), Patient & attendants (profile, passport, emergency contact, consents), Documents (F-06 list), Medical summary, Opinions, Quotes, Payments, Visa, Travel & logistics, Tasks, Messages, Notes (internal, @mentions notify colleagues), Timeline (every event from audit + messages + stage changes, filterable), Incidents. Right rail: coordinator, agent, hospital chosen, quick contact buttons. Page loads in under 1 s with tab data lazy-loaded.
```

Done when: every tab works on a seeded case and mentions notify the colleague.

**C-05 Qualification**

```text
/task C-05 Qualification step (PRD 3 stage 2). Structured qualification form inside the case: diagnosis as stated by patient, current treatment, urgency, budget range + currency, preferred cities, travel window, number of attendants, language, interpreter needed, insurance, how they heard about us. "Request reports" action sends a templated WhatsApp/email with a secure upload link (no login needed, token-scoped to the case, expires in 7 days) that opens a mobile upload page. Call outcome logging (connected, no answer, call back at). Moving to Medical review requires reports received.
```

Done when: a patient can upload reports from the link on a phone without logging in.

**C-06 Medical review**

```text
/task C-06 Medical summary (PRD 3 stage 3, PRD 6: Medical summary). Reviewer queue at /ops/review sorted by urgency and SLA. Structured, versioned summary: diagnosis, key findings, relevant history, investigations available, missing investigations (creates a request to the patient), recommended specialities, urgency, fit-to-travel concerns, suggested hospitals/doctors (search by speciality, city, package availability). Document viewer side-by-side with the form (PDF and images, zoom, rotate). Summary exports as a one-page PDF for hospitals. Reviewer marks complete → case moves to Awaiting opinions draft.
```

Done when: a reviewer can read reports and write a summary on one screen and download it as PDF.

**C-07 Send to hospitals and track opinions**

```text
/task C-07 Opinion requests (PRD 3 stage 4, PRD 6: Send to hospitals). Select up to 5 hospitals/doctors, choose which documents to share (only those the patient consented to; ask consent via WhatsApp link if missing), attach the medical summary, set due time (default 48 h). Creates OpinionRequest per hospital, notifies hospital desk via portal + email + WhatsApp, with email fallback containing a secure link for hospitals not yet using the portal. Tracker grid: hospital, sent, viewed, due, status, response. Reminders at 24 h and 4 h before due; escalation at breach. Coordinator can also enter an opinion received by email on the hospital's behalf (marked as such).
```

Done when: three hospitals receive a request, one responds in its portal and the tracker updates live.

**C-08 Quote builder**

```text
/task C-08 Quote builder (PRD 3 stage 5, PRD 6: Quote builder). Build a quote from one or more opinions: hospital package lines (from Opinion), our service package (choose tier), stay nights × room rate, airport transfers, interpreter hours, visa assistance, SIM, add-ons; discounts with approval above a threshold; margin rules from admin pricing; currency choice with FX snapshot; validity date; inclusions/exclusions; terms. Comparison quote with up to 3 hospital options side by side. Generates a branded PDF (packages/pdf, en/ar) and a patient-portal link; WhatsApp/email send with tracking (opened). Quote versions; patient acceptance moves case to Won. Auto-reminder 3 days before expiry.
```

Done when: a 3-option quote in USD renders as PDF in Arabic and the patient can accept it online.

**C-09 Tasks and reminders**

```text
/task C-09 Tasks (PRD 6: Tasks and reminders). Tasks per case and standalone: title, description, assignee, due date/time, priority, status, checklist items, linked entity. Auto-tasks from stage config (F-10). My tasks page /ops/tasks (today, overdue, upcoming, done), team tasks for managers, calendar view. Reminders via in-app + email/WhatsApp to staff at due time; daily 09:00 IST digest of each user's tasks.
```

Done when: the visa-approved transition creates the pickup task for the right ground coordinator with a reminder.

**C-10 Unified messaging**

```text
/task C-10 Messaging (PRD 6: Unified messaging, PRD 5.2: Messages). Conversation per case with participants (patient, attendants, coordinator, optionally hospital desk in a separate thread). Channels merged into one thread: in-app chat, WhatsApp (inbound webhook → matched to patient by phone; outbound session messages and templates), email (inbound via SES receiving/parse webhook, outbound), SMS. Shows channel icon, delivery/read status, attachments (saved to Documents with consent prompt). Template picker with variables and language. Internal notes inline but visible only to staff. Shared ops inbox /ops/messages with unread, assigned-to-me, unmatched numbers (create lead or link to patient). Typing indicators and live updates via realtime.
```

Done when: a WhatsApp message from a patient appears in their case thread within seconds and the reply reaches their phone.

**C-11 Visa tracker**

```text
/task C-11 Visa (PRD 3 stage 7, PRD 6: Visa tracker). VisaApplication per traveller (patient + attendants): visa type (e-Medical, e-Medical Attendant, regular Medical), checklist generated from nationality rules in admin (passport validity, photo spec, documents), document collection status, invitation letter (uploaded by hospital in H-05 or by staff), application ID, submitted date, status (not started, docs pending, letter issued, applied, approved, refused, more info), decision date, visa validity. Board /ops/visa with filters and overdue alerts. Refused → prompt for next step (re-apply, Lost with reason). Patient-facing view built in P-06.
```

Done when: a case with a patient and two attendants shows three visa tracks with their own checklists.

**C-12 Logistics board**

```text
/task C-12 Logistics board (PRD 6: Logistics board) at /ops/logistics: per city and date, lists of arrivals, departures, airport pickups/drops, hotel check-ins/outs, interpreter bookings and hospital appointments, with assigned driver/interpreter and status. Calendar and list views; filters by city and staff. Conflict warnings (driver double-booked, arrival without pickup, admission without stay). Print/export day sheet PDF for drivers. Uses Booking records; booking creation UIs for each type live inside the case Travel & logistics tab (flights, stay from LG-01, transfer from LG-02, interpreter from LG-03, SIM).
```

Done when: tomorrow's Delhi arrivals all show a pickup or a red warning.

**C-13 Incidents and lost cases**

```text
/task C-13 Incident log and lost reasons (PRD 6). Incidents: type (complaint, medical complication, lost document, payment issue, safety, other), severity, description, linked case, owner, status, escalation to manager after N hours, resolution notes. Lost/On hold/Cancelled flows with mandatory reason and notes, re-open action. Incident list /ops/incidents and a manager dashboard widget.
```

Done when: a high-severity incident notifies the manager immediately.

**C-14 Ops dashboard**

```text
/task C-14 Ops dashboard /ops home: my KPIs today (new leads, first responses due, quotes due, SLA breaches, arrivals today/tomorrow, patients in treatment, tasks due), team view for managers, conversion funnel this month, cases by stage, recent activity feed. Every widget clicks through to the filtered list. Loads in under 1 s using one aggregated endpoint with 60-second cache.
```

Done when: a coordinator can run their whole day starting from this page.

## 9. Phase 1C — Hospital and doctor portal (weeks 7–8)

Eight tasks build `/hospital` (PRD section 7). The test for every screen: is it faster for a busy international-desk officer than replying to an email? Keep forms short, prefill everything we know, and make every request answerable on a phone.

**H-01 Hospital onboarding and profile**

```text
/task H-01 Hospital onboarding (PRD 7: Onboarding). Invite-based signup for the hospital's international desk admin. Multi-step profile: legal name, brand, group and branches, address with map pin, city, accreditations (NABH, JCI, others) with certificate upload and expiry date, departments and specialities, international desk contacts and working hours, facilities (interpreters, halal food, prayer room, airport pickup), photos (public bucket, optimised), bank details (for refunds/pass-through), agreement upload + referral fee % (set by our admin, read-only for hospital). Hospital can manage its own users (desk staff, desk admin) and doctors. Submit for review → admin approval in AD-02. Expiry reminders 60/30/7 days before accreditation expiry; expired accreditation hides the badge on the website.
```

Done when: a hospital completes onboarding and appears in the admin approval queue.

**H-02 Doctors and packages**

```text
/task H-02 Doctor profiles and package catalogue (PRD 7: Package catalogue, Doctor view). Doctors: name, photo, qualifications, registration number, speciality, sub-specialities, experience years, languages, procedures performed, consult fee, teleconsult availability flag, public bio (en + translations). Packages: procedure (treatment master), room category, price + currency, length of stay in hospital and outside, inclusions, exclusions, validity dates, conditions; bulk import from CSV with validation report. Changes to published prices need our admin approval (diff view).
```

Done when: a hospital imports 30 packages from CSV and sees row-level errors for bad rows.

**H-03 Case requests inbox**

```text
/task H-03 Hospital inbox /hospital/requests (PRD 7: Case requests inbox). List of OpinionRequests with patient age/sex/country (name hidden until accepted, if hospital prefers), speciality, urgency, due countdown, status. Detail: medical summary, shared documents (viewer, audited downloads), questions thread with our case manager. Actions: accept (assign doctor), decline with reason, ask for more information (creates a task for our reviewer and notifies). Email fallback link (C-07) lands on this same page with a scoped token. Mobile-friendly. Response-time stats per hospital recorded for H-08 and reports.
```

Done when: a desk officer can accept a request and assign a doctor from a phone.

**H-04 Opinion and estimate form**

```text
/task H-04 Opinion form (PRD 7: Opinion and estimate). Fields: assigned doctor, provisional diagnosis, treatment plan, alternatives, success factors/risks in plain language, investigations needed on arrival, hospital stay days, stay in city after discharge, fit-to-fly guidance, cost estimate (pick a package and adjust, or line items) with currency, inclusions, exclusions, validity date, attachments. Save draft; submit sends it to our case manager and updates the opinion tracker live. Revisions keep history.
```

Done when: a submitted opinion appears in C-07's tracker and can be pulled into C-08's quote builder.

**H-05 Visa invitation letters**

```text
/task H-05 Visa invitation (PRD 7: Visa invitation). For accepted cases with a booking, hospital sees "Invitation letter needed" with traveller details (name, passport number, nationality, attendant names) prefilled for copying into the government Medical and Ayush Visa Portal. Upload the generated letter PDF, enter reference number and date; marks visa track "letter issued" and notifies our case manager and the patient. Reminder if not issued within 2 working days.
```

Done when: uploading a letter updates all three visa tracks of the case.

**H-06 Admission and treatment updates**

```text
/task H-06 Admission updates (PRD 7: Admission updates, PRD 3 stages 10–11). Hospital view of arriving and current patients: confirm admission date, admitted, procedure date, ward/ICU, room, daily status (optional), estimated vs running bill, expected discharge date, final bill upload (amount + PDF), discharge summary upload, fit-to-fly confirmation, follow-up advice. Each update notifies the ground coordinator and case manager; bill above estimate by more than 10% raises an alert (PRD 6: In-treatment updates).
```

Done when: entering a final bill 15% over estimate alerts the case manager.

**H-07 Doctor view (magic link)**

```text
/task H-07 Doctor access (PRD 7: Doctor view). Doctors receive a magic link (F-03) scoped to one case: read summary and documents, write or edit the clinical part of the opinion (desk finalises the costs), reply in the case's hospital thread. Optional full login for doctors who want a list of their assigned cases at /hospital/doctor. Set teleconsult availability slots (used in Phase 2 T-01). Mobile-first layout, fast PDF/image viewer.
```

Done when: a doctor can open the link on a phone and submit the clinical opinion in under 3 minutes.

**H-08 Referral statements and performance**

```text
/task H-08 Referral statements (PRD 7: Referral statements, Performance). Monthly statement per hospital: patients referred, admission and discharge dates, final bill, referral fee % and amount, status (due, invoiced, paid, disputed). Hospital can flag a line as disputed with a comment (creates finance task). Download as PDF/Excel. Performance tab: average response time, acceptance rate, conversion rate, patient ratings by doctor, shown with the same numbers our admin sees.
```

Done when: the statement totals match the finance module's receivables (FI-04).

## 10. Phase 1D — Patient portal (weeks 8–9)

Nine tasks build `/patient` (PRD section 5.2). Patients are often anxious, on a phone, on a slow network and reading in Arabic or Russian, so every screen is mobile-first, light, and says clearly what happens next. Test each task on a real low-end Android phone with network throttled to slow 4G.

**P-01 Patient sign-up, login and attendants**

```text
/task P-01 Patient accounts (PRD 5.2: Sign-up/login). Sign-up and login by phone (WhatsApp OTP preferred, SMS fallback) or email OTP; password optional. Accounts created from website enquiries get a welcome message with a one-tap login link. Profile: personal details, passport (number, expiry, scan upload), emergency contact, preferred language, timezone. Invite attendants by phone/email; attendant sees the itinerary, messages and their own visa track, not medical documents unless the patient allows. Consent centre: list of consents given (data processing, sharing with each hospital, sharing status with agent, marketing) with withdraw buttons (DPDP).
```

Done when: a patient invites an attendant who logs in and cannot see medical documents.

**P-02 My case dashboard**

```text
/task P-02 Patient dashboard (PRD 5.2: My case dashboard). Home shows: StageTracker in plain-language steps, the one next action for the patient (upload reports, review quote, pay deposit, upload passport, confirm travel), coordinator card with photo, languages, WhatsApp and call buttons, upcoming appointments/flights, recent messages, and a support button. Multiple cases supported (past cases under History). Server-rendered first paint, under 150 KB JS for this page.
```

Done when: the dashboard clearly shows a different next action at each stage of a seeded case.

**P-03 Medical records vault**

```text
/task P-03 Records vault (PRD 5.2: Medical records vault). Patient uploads, views and downloads reports, scans, prescriptions; sees documents added by hospital (opinions, bills, discharge summary). Filter by type and date, preview in-page. Sharing panel: per document and per hospital toggles with clear consent wording; changes take effect immediately and are audited. Delete own uploads (soft delete, retained per policy). Uses F-06 components.
```

Done when: revoking sharing for a hospital removes that hospital's access immediately.

**P-04 Opinions and quotes**

```text
/task P-04 Quotes for patients (PRD 5.2: Opinions and quotes, PRD 3 stage 5). Side-by-side comparison of up to 3 options: hospital (accreditation badges, photos), doctor, treatment plan summary, stay, total cost in chosen currency with breakdown, inclusions/exclusions, validity countdown. "Ask a question" opens a message thread prefilled with the option. "Request video consult" stub (T-01). Accept quote: choose option, confirm travellers and dates, accept terms (checkbox + timestamp + IP stored as a Consent), then go to payment. Download quote PDF.
```

Done when: accepting an option moves the case to Won and opens payment.

**P-05 Payments and invoices**

```text
/task P-05 Patient payments (PRD 5.2: Payments; depends on FI-02 gateway service). Pay deposit, service package and add-ons by card (Razorpay international / Stripe), bank wire (show virtual account or bank details with reference; patient uploads proof; finance confirms), UPI for Indian payers. Partial payments and balance due shown clearly. Receipts and invoices downloadable. Payment status updates live from webhooks; failed payments show a retry with another method.
```

Done when: a test card payment in USD shows as paid, with invoice, within seconds.

**P-06 Visa centre**

```text
/task P-06 Visa centre (PRD 5.2: Visa centre). Per traveller: checklist for their nationality and visa type with plain-language help and photo specification examples, upload passport bio page and photo (auto-checks: file type, size, image dimensions, passport expiry at least 6 months after travel), download invitation letter when issued, step-by-step guide with link to the official e-visa site, enter application ID, status tracker with dates. Alerts when something is missing.
```

Done when: a passport expiring in 3 months is flagged before the patient applies.

**P-07 Itinerary**

```text
/task P-07 Itinerary (PRD 5.2: Itinerary). Timeline of the trip: flights (number, times in both timezones), airport pickup (time, driver name, photo, car, plate, phone — shown 24 h before), stay (address, map, check-in, contact, house rules, halal/food notes), hospital appointments and admission, interpreter bookings, return flight and drop. Add-to-calendar (ICS) for each item, offline-readable (cached), shareable read-only link for family at home.
```

Done when: the itinerary works offline after one load on a phone.

**P-08 Messages**

```text
/task P-08 Patient messages (PRD 5.2: Messages). Chat with coordinator using ChatPanel; messages mirror to WhatsApp so the patient can use either; attachments save to the vault with a consent prompt; voice notes (record, upload, play); read receipts; push notification on web (Web Push) for new replies. Show coordinator working hours and the 24x7 emergency number.
```

Done when: a reply sent from WhatsApp shows in the portal chat and vice versa.

**P-09 Feedback and reviews**

```text
/task P-09 Feedback (PRD 5.2: Feedback, PRD 3 stage 12). After return home (configurable delay) send a feedback request: star ratings for hospital, doctor, coordinator, stay, transport; NPS question; comments; permission to publish a testimonial (name/initials/photo/video options). Low scores (≤6 NPS or ≤2 stars) create an incident for the manager. Published testimonials go to admin moderation (AD-04) before showing on the website. Prompt to post a Google review for happy patients.
```

Done when: a low rating creates an incident and a 5-star testimonial waits for moderation.

## 11. Phase 1E — Public website and SEO (weeks 9–11)

Thirteen tasks build `apps/web` (PRD section 5.1). The website must win trust in seconds and rank in Google for searches like "knee replacement cost India" in English and Arabic. Every page is statically generated or ISR, served from CloudFront, with structured data and hreflang. Content (hospitals, doctors, packages) comes from the same database the portals edit, revalidated on change.

**W-01 SEO foundation**

```text
/task W-01 Website SEO foundation. Locale-prefixed routes (/en, /ar, later /ru, /fr) with hreflang alternates and x-default, canonical URLs, generateMetadata per page with title/description templates, Open Graph and Twitter images (dynamic OG image route), XML sitemaps split by type (treatments, hospitals, doctors, cities, blog) with lastmod, robots.txt, schema.org JSON-LD helpers (Organization, MedicalBusiness/Hospital, Physician, MedicalProcedure, FAQPage, BreadcrumbList, Article, Review). On-demand ISR revalidation endpoint called by the API when hospitals, doctors, packages or CMS pages change. Public read API in apps/api (module public) with Redis cache and ETags.
```

Done when: Google Rich Results Test passes for a hospital and a treatment page.

**W-02 Home page**

```text
/task W-02 Home page (PRD 5.1: Home page). Hero with search (treatment/condition/hospital/doctor typeahead) and "Get free quote" CTA; trust strip (partner hospital accreditations, MVTF empanelment badge when obtained, patients served, countries); how it works in 4 steps; top treatments with India price ranges vs home country/USA/UK; featured hospitals and doctors; patient video stories (lazy-loaded, poster image first); why India; visa and travel help teaser; FAQs; final CTA. Content blocks editable in CMS (AD-04). Lighthouse mobile ≥ 90 for performance, accessibility, SEO.
```

Done when: Lighthouse mobile scores ≥ 90 in all four categories in en and ar.

**W-03 Treatment pages**

```text
/task W-03 Treatments (PRD 5.1: Treatment pages). /treatments listing grouped by speciality with filters and search. Detail page per treatment: overview, who needs it, procedure steps, hospital stay and total time in India, recovery, success factors, price table (India range in user's currency vs home country, USA, UK — values from admin pricing data, with source note), hospitals and doctors offering it (with package prices), patient stories, FAQs (FAQPage schema), related treatments, sticky "Get free quote" with the treatment prefilled. Content from CMS with translations.
```

Done when: a treatment page shows prices in the visitor's chosen currency and links to quote form prefilled.

**W-04 Hospital pages**

```text
/task W-04 Hospitals (PRD 5.1: Hospital pages). /hospitals listing with filters (city, speciality, accreditation, treatment) and map view (Google Maps, loaded on demand). Detail: gallery, accreditations with expiry-aware badges, specialities, international patient facilities, featured doctors, packages with prices, location map and nearby stays, reviews/testimonials, FAQs, "Get quote from this hospital" CTA. Only approved and published hospitals appear.
```

Done when: unpublishing a hospital in admin removes it from the site within a minute.

**W-05 Doctor pages**

```text
/task W-05 Doctors (PRD 5.1: Doctor pages). /doctors listing with filters (speciality, city, hospital, language, teleconsult available) and search. Detail: photo, qualifications, experience, registration, languages, hospital, procedures, consult fee, availability for teleconsult, reviews, "Ask this doctor" (opens quote form addressed to this doctor). Physician schema.
```

Done when: "Ask this doctor" creates a lead that shows the doctor in the case.

**W-06 Search**

```text
/task W-06 Site search. Typeahead across treatments, conditions (synonyms list, e.g. "heart bypass" → CABG), hospitals, doctors and cities using Postgres full-text + trigram similarity, multilingual (en/ar transliteration-friendly), results grouped by type, keyboard navigation, < 150 ms server time with Redis cache. Full results page with filters. Log zero-result searches for content planning.
```

Done when: typing "knee" in English or Arabic shows grouped results instantly.

**W-07 Cost estimator**

```text
/task W-07 Cost estimator /cost-calculator (PRD 5.1: Cost estimator). Steps: treatment → city (or any) → room category → number of attendants → nights outside hospital. Shows price range from live package data plus estimated stay, transfers and service package, in the chosen currency, with inclusions. Contact details (name, WhatsApp number, email, country) required before showing the detailed breakdown; creates a lead (C-01) with the estimate attached and sends it by WhatsApp/email.
```

Done when: the estimate appears both on screen and in the new lead's case.

**W-08 Free quote form**

```text
/task W-08 Free quote form (PRD 5.1: Free quote form). Multi-step, mobile-first: condition/treatment, patient country and age, short description, reports upload (FileUploader, up to 500 MB, can skip and upload later), contact (name, WhatsApp number with country code, email, preferred language), consent checkboxes (DPDP wording, separate marketing opt-in). Saves progress locally so a dropped connection doesn't lose data. Turnstile captcha. On submit: lead via C-01, thank-you page with what happens next and expected response time, instant WhatsApp/email confirmation. Embeddable in any page with prefilled fields.
```

Done when: submitting on a throttled phone connection succeeds and the lead arrives in the ops inbox.

**W-09 City and destination pages**

```text
/task W-09 Destination pages (PRD 5.1: City pages; P1 but cheap to add now). /destinations/india overview and /destinations/india/[city] for each city with hospitals: hospitals list, top treatments, stay options and price ranges, weather by month, how to reach (airport, flight connections from target countries), local tips (halal food, prayer places, currency). CMS-editable.
```

Done when: every city with a published hospital has a page in the sitemap.

**W-10 Blog and guides**

```text
/task W-10 Blog and guides (PRD 5.1: Blog and guides). Article listing with categories (cost guides, visa guides, treatment guides, patient stories), tags, author, reading time; article page with table of contents, Article schema, related articles, inline quote CTA. Content from CMS (AD-04) with per-language versions. RSS feed.
```

Done when: publishing an article in admin makes it live and in the sitemap.

**W-11 Partner pages**

```text
/task W-11 Become a partner (PRD 5.1). /partners/hospitals and /partners/agents landing pages with benefits, process and forms. Hospital form creates a hospital lead for our partnerships team (admin list); agent form starts agent registration (A-01). About us, mission and vision, contact page with map, office hours and WhatsApp.
```

Done when: an agent applying from the site appears in the admin agent approval queue.

**W-12 Legal pages and consent**

```text
/task W-12 Legal and compliance pages (PRD 5.1: Legal pages, PRD 12). Privacy policy, terms of use, refund policy, medical disclaimer, referral-fee disclosure, grievance officer details, cookie policy — all CMS-managed with version numbers and effective dates; users who accepted an older version are asked to accept the new one on next login. Cookie consent banner (necessary / analytics / marketing) that actually blocks GA4 and Meta Pixel until consent.
```

Done when: analytics scripts do not load before consent.

**W-13 Analytics and tracking**

```text
/task W-13 Analytics (PRD 10: Analytics and ads). GA4 and Meta Pixel via a consent-aware loader; events: search, view_treatment, start_quote, upload_reports, submit_quote, whatsapp_click, call_click, estimator_complete. Server-side conversions (Meta Conversions API, Google Ads enhanced conversions) when a lead is created and when a case is Won, with hashed contact data only. UTM and click-ID capture into the lead source (C-01). Never send medical data to analytics.
```

Done when: a test lead shows its UTM source in the case and a conversion in the ad platform test tool.

## 12. Phase 1F — Agent portal (week 11)

Five tasks build `/agent` (PRD section 8). Agents bring most early patients, so referring must take under a minute on a phone, and commission must be visible to the last rupee. The privacy rule from F-04 applies everywhere: agents see stage and name only, never medical data.

**A-01 Agent registration and KYC**

```text
/task A-01 Agent onboarding (PRD 8: Agent registration). Apply as individual or agency: name, company, country, city, languages, phone/WhatsApp, email, ID document and business proof uploads, payout details (international bank/SWIFT or local transfer details, PayPal), tax details where applicable. Accept code of conduct and agreement (versioned, checkbox + timestamp; e-sign in Phase 2). Status: applied → KYC review → approved/rejected with reason (AD-03). On approval: unique agent code, referral link and QR code generated, welcome message with portal login.
```

Done when: an approved agent receives their referral link and QR by WhatsApp and email.

**A-02 Refer a patient**

```text
/task A-02 Referral (PRD 8: Refer a patient). Quick form: patient name, country, phone/WhatsApp, treatment, short note, reports upload, patient consent confirmation (agent confirms patient agreed; system also sends the patient a consent request link). Creates lead via C-01 tagged to the agent. Referral link/QR: visitor lands on the website with the agent code stored in a first-party cookie for 90 days; any quote form submitted in that window is attributed. Attribution conflicts (patient already exists or another agent) go to an admin review queue, never silently overwritten.
```

Done when: a lead submitted through an agent's QR link is attributed to that agent.

**A-03 My referrals**

```text
/task A-03 Referral list (PRD 8: My referrals). List and detail of the agent's referred cases: patient name (or initials if patient declined sharing), country, treatment category, stage in plain words, last update date, expected commission. No medical documents, diagnosis, bills or messages. Notifications on stage changes (F-07 agent alerts). Filters and search; dashboard tiles (referred, in progress, treated, lost) for this month and all time.
```

Done when: the agent sees stage updates live but gets 403 on any medical endpoint (test).

**A-04 Commission plans and statements**

```text
/task A-04 Commissions for agents (PRD 8: Commission; calculation engine is FI-05). Show the agent's plan: % or fixed amount per hospital, treatment category or tier, and when commission is earned (after hospital referral fee is received). Ledger: earned, approved, paid, pending, reversed (refunds/cancellations), with case reference. Monthly statement PDF/Excel download.
```

Done when: the ledger total equals the sum of approved, paid and pending commissions in finance.

**A-05 Payouts**

```text
/task A-05 Payouts (PRD 8: Payouts). Agent requests payout of approved balance (minimum amount configurable); finance approves in FI-05; status requested → approved → paid with transfer reference and date; payout advice PDF. Payout details changes need re-verification (OTP + admin approval) to prevent fraud.
```

Done when: changing bank details blocks payouts until an admin re-approves.

## 13. Phase 1G — Admin, finance, logistics and reports (weeks 6–12, interleaved)

Eighteen tasks build `/admin`, finance and the logistics masters (PRD sections 9 and 15). They are interleaved with earlier phases because other modules depend on them: **build LG-01 to LG-04 before C-12, FI-02 before P-05, and AD-04 before W-02.** Every finance task gets `/security-check`, and every money calculation gets unit tests with real-looking edge cases (partial payments, refunds, currency changes, rounding).

### Admin

**AD-01 Users and roles**

```text
/task AD-01 Staff user management /admin/users (PRD 9.1). Invite staff, set role(s), team, cities, languages, working hours and leave (used by C-02), deactivate (revokes sessions), force 2FA reset, view login history. Teams with managers. Impersonate-as-user for super admin only, read-only, fully audited and shown with a banner.
```

Done when: deactivating a user logs them out everywhere within seconds.

**AD-02 Hospital and doctor approvals**

```text
/task AD-02 Partner approvals (PRD 9.1). Queue of hospital onboarding submissions, profile edits and package price changes with side-by-side diff; verify accreditation documents; approve/reject with reason; set referral fee %, agreement dates and documents; publish/unpublish hospital, doctor, package on the website (triggers ISR revalidation). Partner health view: accreditation expiries, agreement expiries, response-time trends.
```

Done when: approving a price change updates the website and quote builder.

**AD-03 Agent approvals and commission plans**

```text
/task AD-03 Agent admin (PRD 9.1). KYC review queue with document viewer, approve/reject/suspend with reason, assign commission plan, attribution-conflict queue from A-02, payout-detail change approvals. Commission plan editor: rules by hospital, treatment category and tier, percentage or fixed, effective dates, preview with an example case.
```

Done when: a new commission plan applies only to cases won after its effective date.

**AD-04 CMS**

```text
/task AD-04 CMS in /admin/content (PRD 9.1: CMS). Content types: treatment content (sections, FAQs, price comparison data with source note), city pages, blog articles, home page blocks, legal pages (versioned), testimonials moderation, FAQ library, navigation menus. Rich text editor (Tiptap) with images (public bucket, auto-resized WebP/AVIF), embeds (YouTube) and sanitised HTML output. Per-language versions with translation status (missing, draft, published), "copy from English" helper, optional machine translation draft (Phase 2 T-03). SEO fields (title, description, slug, OG image, noindex). Draft → review → publish workflow with scheduled publish; preview link. Publishing triggers ISR revalidation.
```

Done when: an editor can draft an Arabic article, preview it, and schedule it.

**AD-05 Pricing rules and FX**

```text
/task AD-05 Pricing (PRD 9.1: Pricing rules). Service packages (Basic, Standard, Premium) with what each includes and prices per currency or auto-converted; add-on price list (extra night, interpreter hour, SIM, sightseeing, wheelchair transfer); margin rules for quote builder by component; discount approval thresholds; FX settings (provider, markup %, manual override with audit). Price changes are versioned and existing quotes keep their snapshot.
```

Done when: changing the Premium price doesn't alter quotes already sent.

**AD-06 Templates**

```text
/task AD-06 Template management (PRD 9.1: Templates, PRD 6: Templates). Editor for email, WhatsApp, SMS, in-app and PDF (quote, welcome pack, visa checklist, pre-travel checklist) templates per event and language, with variable picker, live preview using a sample case, test send to self, and version history. WhatsApp templates show approval status synced from the BSP and cannot be edited after approval without re-submission.
```

Done when: editing the Arabic "quote sent" email and test-sending it works.

**AD-07 Settings and audit viewer**

```text
/task AD-07 System settings (PRD 9.1). Company details (for invoices), GST settings, invoice number series, SLA policies and stage targets (F-10), working-hours calendar and holidays, assignment rules (C-02), visa rules per nationality (C-11, P-06), retention policy periods (L-06), feature flags. Audit log viewer from F-05 linked here. Every settings change is audited.
```

Done when: changing the quote SLA from 48 h to 36 h changes the countdowns on open cases.

### Finance

**FI-01 Invoicing**

```text
/task FI-01 Invoicing (PRD 9.2: Invoicing). GST-compliant invoices for our service fees: company GSTIN, place of supply, SAC code, export-of-services treatment (zero-rated under LUT) for foreign patients vs IGST/CGST+SGST for Indian payers, invoice number series per financial year, currency + INR equivalent at the applicable rate, HSN/SAC summary. Credit notes linked to invoices. Branded PDF (en; ar translation of labels). Invoice list with filters, ageing, export to Excel. Hospital referral-fee invoices use the same engine (FI-04). Confirm tax treatment with the CA before go-live.
```

Done when: an export invoice and a domestic invoice both show correct tax lines.

**FI-02 Payment collection**

```text
/task FI-02 Payments service (PRD 9.2: Payment collection, PRD 10). Gateway adapters for Razorpay (international cards, UPI) and Stripe behind one PaymentProvider interface; create payment intents/orders and payment links (sent by WhatsApp/email); verify webhook signatures; idempotent webhook handling; partial payments; multi-currency with INR settlement amount recorded; bank wire flow (expected payment with reference, proof upload, finance confirmation); payment types: deposit (pass-through to hospital), service package, add-ons, consult fee. Reconciliation screen: gateway settlements vs recorded payments, mismatches highlighted. Never trust amounts from the client.
```

Done when: replaying the same webhook twice records one payment.

**FI-03 Refunds**

```text
/task FI-03 Refunds (PRD 9.2: Refunds). Refund request from case (reason, amount, method), policy check against refund rules (e.g. before/after visa, cancellation window), approval by finance manager above a threshold, processing through the original gateway or bank transfer, credit note generation, commission reversal trigger (FI-05), patient notification. Refund register report.
```

Done when: a refunded case reverses the agent's commission automatically.

**FI-04 Hospital referral fees**

```text
/task FI-04 Referral fee receivables (PRD 9.2). When a hospital uploads the final bill (H-06), calculate the referral fee from the agreement % (with min/max caps and exclusions such as pharmacy if configured), create a receivable, group monthly per hospital into an invoice (FI-01), track due date, payments received, short payments and disputes (from H-08), ageing buckets (0-30, 31-60, 61-90, 90+), reminders to the hospital's accounts contact.
```

Done when: ageing report matches the sum of open receivables.

**FI-05 Agent commissions and payouts**

```text
/task FI-05 Commission engine (PRD 9.2: Agent commissions). When a hospital referral fee is received, compute the agent commission per their plan (AD-03), create Commission (earned), require finance approval (bulk approve), handle reversals on refunds, TDS deduction where applicable (configurable rate, certificate tracking), payout batches from approved requests (A-05) with a bank batch file export (CSV in the format of our bank), mark paid with reference.
```

Done when: a full cycle (fee received → commission → approval → payout batch → paid) works on seed data.

### Logistics (build before C-12)

**LG-01 Stays**

```text
/scaffold-module Stay /admin/logistics/stays (PRD 9.3: Stays). Partner guest houses, hotels and service apartments: address and map pin, distance and travel time to each partner hospital (Google Distance Matrix, cached), room types with rates per night (cost and sell price), amenities (halal kitchen, wheelchair access, lift, kitchenette, Wi-Fi), photos, contact, contract dates. Availability calendar per room type with bookings from cases; overbooking warning.
```

Done when: the case booking dialog suggests stays sorted by distance to the chosen hospital.

**LG-02 Transport**

```text
/scaffold-module Transport /admin/logistics/transport (PRD 9.3: Transport). Vendors, drivers (name, photo, phone, languages, licence expiry), vehicles (type incl. wheelchair-accessible and ambulance, plate, capacity), city rate cards (airport transfer, hourly, hospital runs). Transfer jobs from case bookings with assignment, status (scheduled, en route, picked up, completed) and driver details shared with the patient 24 h before.
```

Done when: assigning a driver sends the patient the driver's name, photo and car 24 h before pickup.

**LG-03 Interpreters**

```text
/scaffold-module Interpreter /admin/logistics/interpreters (PRD 9.3: Interpreters). Interpreters (in-house or freelance): languages, cities, hourly rate, availability calendar. Assignment from a case booking; interpreters see their assignments in /ops (limited role) and log hours, which feed vendor payables (Phase 2) and case cost.
```

Done when: an interpreter logs hours against an assignment from their phone.

**LG-04 Flight bookings**

```text
/task LG-04 Flight bookings (PRD 9.3: Flight bookings). Record flights booked via the travel partner or by the patient: PNR, airline, flight numbers, departure/arrival airports and times (with timezones), travellers, cost/sell price, ticket upload. Saving an inbound flight auto-creates an airport pickup booking and a task for the ground coordinator; saving an outbound flight creates a drop task. Changes to flight times update the linked pickup and notify the driver.
```

Done when: changing an arrival time moves the pickup and notifies the driver.

### Reports

**R-01 Reports module**

```text
/task R-01 Reports (PRD 15, PRD 9.1: Reports). Report pages with date range, country, treatment, hospital, agent, owner and source filters: leads by source/country/treatment; first-response time and quote turnaround vs SLA; hospital response times; funnel (lead → qualified → quote → won → treated) with conversion %; visa success rate; revenue per case and by component; bill accuracy (final vs estimate); satisfaction and NPS; agent productivity; lost reasons. Charts (lazy-loaded) plus tables; every report exports to Excel (worker job for large exports, emailed link). Use SQL views/materialised views refreshed every 15 minutes for heavy aggregations.
```

Done when: each PRD section 15 metric has a report whose numbers match a manual check on seed data.

**R-02 Management dashboard**

```text
/task R-02 Admin dashboard /admin home: this month vs last month for leads, conversion, won cases, revenue, receivables, payouts due, SLA breach rate, NPS; top countries, treatments, hospitals and agents; alerts (accreditations expiring, SLA breaches, incidents open, failed payments, failed notifications). Each tile links to the report.
```

Done when: the founders can see the business health in one screen.

## 14. Phase 1H — Hardening, compliance and launch (weeks 13–16)

Ten tasks turn a working system into one you can trust with real patients. Don't shorten this phase: most launch-week disasters (lost data, leaked documents, broken WhatsApp templates, slow pages under real traffic) are caught here. L-08 and L-09 are human tasks.

**L-01 Integration completion**

```text
/task L-01 Switch every integration from sandbox to production-ready configuration behind env vars: WhatsApp BSP (all templates approved in en and ar, inbound webhook verified), SES production (SPF, DKIM, DMARC for our domain, bounce/complaint handling), SMS with DLT templates, Razorpay/Stripe live mode keys (kept in AWS Secrets Manager), Google Maps keys restricted by domain, FX provider. Add a /admin/integrations health page that tests each provider and shows the last success/failure.
```

Done when: every integration shows green on the health page in staging with live credentials.

**L-02 End-to-end journey tests**

```text
/task L-02 Playwright suite for the full PRD section 3 journey across portals: website quote → ops qualification → report upload by link → medical review → opinion requests → hospital accepts and submits opinion → quote built and sent → patient accepts and pays (gateway test mode) → visa tracks with invitation letter → flights and pickup booked → arrival → admission → final bill → discharge → return → feedback → referral fee → agent commission → payout. Plus exit paths (lost, refund). Runs in CI nightly against staging and on every release candidate, with videos on failure.
```

Done when: the full journey passes in CI three nights in a row.

**L-03 Performance pass**

```text
/task L-03 Performance hardening using section 17 of BUILD_PLAN.md. Run Lighthouse CI on 10 key website pages (en + ar) and fail CI below budgets; bundle analysis for web and portal with size budgets; k6 load tests for: public pages via CDN, quote form submit, case list with filters, case 360, chat send, file upload start (target p95 < 300 ms API at 50 concurrent staff users and 200 req/s public API); EXPLAIN ANALYZE every slow query and add indexes; Redis caching for public catalogue endpoints; fix N+1s. Write results to docs/performance.md.
```

Done when: all budgets in section 17 are met and documented.

**L-04 Security hardening**

```text
/task L-04 Security pass using the checklist in BUILD_PLAN.md section 18. Run the security-reviewer subagent over each module (auth, rbac, files, cases, messaging, payments, agents, hospitals). Add security headers (CSP with nonces, HSTS, frame-ancestors), cookie flags review, rate limits review, dependency audit (pnpm audit + Dependabot), secret scanning in CI (gitleaks), container image scanning (Trivy), OWASP ZAP baseline scan against staging in CI. Fix all Critical/High findings with tests. Write docs/security.md listing controls.
```

Done when: ZAP baseline, gitleaks and Trivy are clean and no Critical/High findings remain open.

**L-05 Production infrastructure**

```text
/task L-05 Terraform for AWS ap-south-1 (staging and production workspaces): VPC with private subnets, ECS Fargate services for api (min 2 tasks), worker, web, portal with autoscaling on CPU and queue depth, ALB with HTTPS (ACM), CloudFront for web and public assets, RDS PostgreSQL Multi-AZ with automated backups (30-day retention) and point-in-time recovery, ElastiCache Redis, S3 buckets (private with SSE-KMS and versioning; public assets), SES, Secrets Manager, CloudWatch logs and alarms (5xx rate, latency, queue backlog, DB CPU/storage, failed jobs) to email/Slack/WhatsApp, WAF on ALB and CloudFront with rate-based rules, daily DB snapshot copy to a second region. Deploy pipeline: staging on merge to main, production on tagged release with manual approval, zero-downtime rolling deploys, automatic DB migration step before deploy. Write docs/runbook.md: deploy, rollback, restore from backup, rotate secrets, incident response.
```

Done when: a restore from backup to a fresh database is rehearsed and documented.

**L-06 Privacy and DPDP features**

```text
/task L-06 Privacy compliance (PRD 12). Consent records for every purpose with version and timestamp (already captured in P-01, W-08, W-12: verify coverage). Data-principal requests: patient can request a copy of their data (export job → ZIP of JSON + documents, secure link) and erasure (workflow with legal-hold checks, anonymise instead of delete where records must be retained, e.g. invoices). Grievance submission form and admin queue with SLA. Retention jobs in the worker per AD-07 settings (e.g. passport copies deleted 1 year after case close, inactive leads anonymised after 2 years). Breach-response runbook in docs/runbook.md. Review all analytics and logs for personal data leaks.
```

Done when: an erasure request on a closed test case removes documents and anonymises the patient while invoices remain.

**L-07 Accessibility, RTL and content QA**

```text
/task L-07 Accessibility and localisation QA. Run axe (Playwright + @axe-core) on all website pages and main portal screens, fix WCAG 2.1 AA violations; keyboard-only walkthrough of the quote form and patient portal; screen-reader labels for icons; colour contrast. Arabic: review every screen in RTL for mirrored layouts, icons that must flip, numbers/dates, mixed-direction text (phone numbers, case numbers). List untranslated keys and machine-drafted Arabic still in packages/i18n/REVIEW.md for a human translator.
```

Done when: axe reports zero serious violations and the Arabic review list is handed to a translator.

**L-08 UAT and data loading (human + Claude Code)**

```text
/task L-08 Production data import tools: CSV/Excel importers (with dry-run validation report) for hospitals, doctors, packages, stays, drivers, interpreters, agents and initial CMS content, plus a script to create real staff users with invitation emails. Then I will run UAT with coordinators, 2 partner hospitals and 2 agents; I'll paste their bug reports to you one at a time.
```

Done when: real launch data is loaded in staging and UAT sign-off is received from ops, one hospital and one agent.

**L-09 Go-live checklist (human)**

- [ ] External penetration test done and Critical/High findings fixed
- [ ] Lawyer approved privacy policy, terms, refund policy, disclaimer, agreements; CA approved invoice tax treatment
- [ ] WhatsApp templates approved; SES out of sandbox; payment gateway in live mode with a real small transaction refunded
- [ ] Backups verified by restore; alarms tested; on-call rota and 24x7 emergency number staffed
- [ ] DNS, SSL, Google Search Console, sitemaps submitted; redirects from any old site
- [ ] Staff trained; SOPs written for each stage of the journey
- [ ] Soft launch to one source country for 2 weeks, then open others

**L-10 Post-launch loop**

```text
/task L-10 Post-launch tooling: a weekly automated report (worker job, emailed to founders) with PRD section 15 metrics vs last week; in-app feedback widget for staff ("report a problem" with screenshot and page context) that creates a GitHub issue via the API; Sentry alert rules for new errors. Document the bug-fix workflow: Sentry issue → paste into Claude Code → reproduce with a failing test → fix → /review-task → release.
```

Done when: a staff "report a problem" creates a GitHub issue with page context.

## 15. Phase 2 — Scale operations (months 5–8)

Thirteen tasks deliver every P1 feature in the PRD. Start them only after the MVP has run with real patients for 2–4 weeks, and reorder them by what coordinators and patients actually ask for.

**M-01 Patient mobile app**

```text
/task M-01 Expo (React Native) patient app in apps/mobile reusing packages/contracts, api-client and i18n (en, ar RTL, ru, fr). Screens: login (OTP), dashboard with StageTracker and next action, records vault with camera capture of reports, quotes and acceptance, payments (gateway mobile SDK or hosted checkout), visa centre with passport photo capture and checks, itinerary with offline cache, chat with push notifications (Expo push + FCM/APNs), feedback, emergency button. Deep links from WhatsApp messages open the right screen. EAS build and submission config for Play Store and App Store.
```

Done when: a test patient completes the journey on Android and iOS test builds.

**M-02 Ground coordinator app**

```text
/task M-02 Ground coordinator mode in apps/mobile (PRD 6: Ground app). Today's jobs by time (pickups, drops, escorts, check-ins) with patient photo, flight status, address and one-tap navigation; mark steps done with photo proof and GPS timestamp; post daily patient update (text, photo, voice) that goes to the family and case; log expenses with receipt photo; incident quick-report; offline queue that syncs when back online. Role-gated to ground coordinators and interpreters.
```

Done when: a pickup marked done offline syncs with photo once the phone reconnects.

**T-01 Video teleconsults**

```text
/task T-01 Teleconsults (PRD 5.2: Video consult, PRD 7: Teleconsult, PRD 3 stage 12). Doctor availability slots (H-07), patient books a slot from a quote or follow-up, pays the consult fee (FI-02), both get calendar invites and reminders 24 h and 15 min before, join an in-app video room (100ms/Agora/Daily adapter) with interpreter as optional third participant, doctor writes consult notes saved to the patient record. Follow-up consult schedule auto-created at discharge (1 week, 1 month, 3 months, configurable).
```

Done when: patient, doctor and interpreter join one call and notes save to the record.

**T-02 Cloud telephony**

```text
/task T-02 Call logging (PRD 6: Call logging). Exotel/Twilio adapter: click-to-call from case and inbox (bridges staff phone and patient), inbound calls matched to patient and shown as a pop-up with case link, call recordings attached to the case timeline (access-controlled), call outcomes logged, missed-call follow-up tasks. IVR menu by language routing to the right team.
```

Done when: an inbound call from a known patient pops their case on the coordinator's screen.

**T-03 Auto-translation**

```text
/task T-03 Translation (PRD 5.2: Messages auto-translate, PRD 10). Google Translation/DeepL adapter: translate incoming chat messages to the coordinator's language and outgoing replies to the patient's language (both versions stored, original always viewable); translate uploaded report text (OCR for scanned PDFs) into English for the medical reviewer, clearly marked machine translation; draft CMS translations (AD-04) for human review.
```

Done when: an Arabic patient message shows an English translation with the original one click away.

**T-04 More languages and compare**

```text
/task T-04 Add Russian and French across website, portals, templates and PDFs (PRD 5.1: Multi-language), with SEO hreflang updates; plus the website compare feature (PRD 5.1: Compare) for up to 3 hospitals or packages side by side, shareable URL.
```

Done when: a Russian visitor can compare 3 packages in Russian and request a quote.

**T-05 Stay, add-ons and expense tracker**

```text
/task T-05 Patient self-service add-ons and expenses (PRD 5.2: Stay and add-ons, Expense tracker). Patient picks room type and extra nights from available stays (LG-01), adds interpreter hours, sightseeing, halal food plan, SIM, wheelchair transfers; price updates live and becomes a quote amendment for coordinator approval and payment. Expense tracker: running hospital bill vs estimate (from H-06), deposits paid, our invoices, balance due, in patient currency.
```

Done when: adding two extra nights creates an amendment the patient can pay.

**T-06 In-treatment updates for family**

```text
/task T-06 Daily treatment updates (PRD 6: In-treatment updates). Ground coordinator posts daily status (template with condition, procedures done, next steps, photo optional); hospital daily status (H-06) merged; family members (attendants and up to 3 "family at home" contacts with consent) receive a WhatsApp digest each evening in their language. Bill-vs-estimate variance alert above 10% to case manager and patient.
```

Done when: family at home get one clear evening update per day in Arabic.

**T-07 Follow-up care and emergency**

```text
/task T-07 Follow-up (PRD 5.2: Follow-up, Emergency button). Discharge plan: medicines with schedule (reminders by WhatsApp/push), recovery checklist, warning signs, follow-up consult schedule (T-01), local doctor letter. Case closes automatically after the last follow-up unless issues are open. Emergency button: one tap calls the 24x7 ops line and sends the patient's location and case to the on-call coordinator, creating a high-severity incident.
```

Done when: pressing emergency in the app pages the on-call coordinator with location.

**T-08 Finance phase 2**

```text
/task T-08 Finance additions (PRD 9.2 P1 items): hospital deposits collected on the hospital's behalf as pass-through liabilities (not revenue) with remittance to hospital; vendor payables for stays, drivers, interpreters and SIM vendors (bills, approvals, payments, ageing); profit per case (revenue minus costs per component) with rollups by country, hospital and agent; accounting sync to Zoho Books (or Tally export) for invoices, payments, credit notes, payables.
```

Done when: profit per case matches a hand calculation on a seeded case.

**T-09 e-Signature**

```text
/task T-09 e-Sign (PRD 10). Leegality/Digio/DocuSign adapter: hospital agreements, agent agreements, patient consent and quote acceptance (optional upgrade from checkbox). Send for signature, track status by webhook, store signed PDF and audit trail in Documents. Expiry reminders for agreements.
```

Done when: an agent signs their agreement on a phone and the signed PDF appears in their profile.

**T-10 Hospital groups and performance**

```text
/task T-10 Multi-branch hospital groups (PRD 7: Multi-branch, Performance). Group admin user manages all branches from one login with a branch switcher and combined reports; requests can target a group and be routed to a branch. Hospital performance dashboard for both hospitals and our admins: response time, acceptance, conversion, ratings, bill accuracy, trend charts.
```

Done when: a group admin sees combined numbers for three branches.

**T-11 Agent growth tools**

```text
/task T-11 Agent tools (PRD 8 P1 items). Marketing kit: brochures, price sheets, videos and social posts per language, auto-personalised with the agent's referral link/QR (PDF/image generation in worker). Sub-agents: agency owners add staff users with their own codes, rolled up commissions. Training: short lessons and quizzes on visa rules, treatments and ethics code; completion required before referrals are enabled.
```

Done when: an agency adds a sub-agent and downloads a brochure with that sub-agent's QR.

## 16. Phase 3 — Grow and automate (months 9–12)

Eight tasks deliver every P2 feature. These are growth features; prioritise them by the metrics in R-01 (for example, build the AI assistant first if after-hours leads go unanswered).

**G-01 AI website assistant**

```text
/task G-01 AI assistant on the website and patient portal (PRD 5.1: AI assistant) using the Claude API. Answers FAQs from our CMS content, treatment pages, package prices and visa guides (retrieval over published content only), in the visitor's language; collects enquiry details and books a callback or creates a lead (C-01); hands off to a human in chat during working hours. Strict guardrails: never diagnoses, never recommends a specific treatment for a person, always suggests a doctor's opinion, refuses off-topic requests; shows a disclaimer. Conversation logs reviewed in admin; no medical documents are sent to the model. Rate limits and cost caps.
```

Done when: the assistant answers a visa question correctly in Arabic and books a callback, and declines to give a diagnosis.

**G-02 Hospital API**

```text
/task G-02 Partner API for large hospital groups (PRD 7: API option). Versioned REST API (/partner/v1) with API keys per hospital (hashed, rotatable, scoped), OAuth2 client credentials optional; endpoints: list/get opinion requests, submit opinion, update admission/bill/discharge, upload documents, list packages and update prices (goes to approval). Webhooks to the hospital for new requests and updates with HMAC signatures and retries. Public developer docs page generated from OpenAPI, sandbox environment, rate limits, usage logs in admin.
```

Done when: a test client submits an opinion purely via API and webhook delivery is logged.

**G-03 Agent tiers and leaderboard**

```text
/task G-03 Agent tiers (PRD 8: Leaderboard and tiers). Silver/Gold/Platinum thresholds by treated patients per quarter, automatic tier upgrades/downgrades with notice, higher commission plans per tier, leaderboard per country (opt-in display names), badges in the agent portal.
```

Done when: an agent crossing a threshold is upgraded and their next commission uses the new rate.

**G-04 Patient referral rewards**

```text
/task G-04 Refer a friend (PRD 5.2: Refer a friend). Each patient gets a referral code/link after case close; referred patients are attributed; reward (discount on service package or cash-back) issued when the referred case is treated, with fraud checks (same phone/passport/payment instrument). Tracking page in the patient portal.
```

Done when: a reward is issued only after the referred patient's treatment is complete.

**G-05 Flight tracking**

```text
/task G-05 Live flight tracking (PRD 10: Flight data). Flight status provider adapter (AviationStack/FlightAware): poll inbound flights from 24 h before arrival; delays and gate changes automatically move pickup times, notify driver, coordinator and family; cancelled flights create an urgent task.
```

Done when: a simulated 2-hour delay moves the pickup and notifies the driver.

**G-06 More markets and wellness**

```text
/task G-06 Market expansion. Add Swahili, Amharic and Uzbek (website, portal, templates) with RTL unaffected; per-country landing pages with local currency, testimonials and visa notes. Wellness and AYUSH category (PRD 1: in scope): wellness centres as a partner type, AYUSH visa type in the visa rules, wellness packages, treatment pages and estimator support.
```

Done when: a Kenyan visitor sees Swahili pages with KES prices and can book an Ayurveda package enquiry.

**G-07 Welcome kit inventory**

```text
/task G-07 Welcome kit stock (PRD 9.3: Welcome kit). Items per city (SIM cards, kits, adapters), stock levels, issue to patient on arrival from the ground app, low-stock alerts, cost to case.
```

Done when: issuing a SIM on arrival reduces stock and appears in the case costs.

**G-08 Advanced analytics**

```text
/task G-08 Advanced analytics. Cohort and channel attribution reports (cost per lead and per won case by campaign using ad-spend import), forecasting of next month's arrivals from pipeline stages, hospital and agent scorecards, export to a BI tool (read-only analytics replica or nightly Parquet export to S3) without personal data.
```

Done when: the founders can see cost per won case by channel for the last quarter.

## 17. Performance playbook

Speed is designed in from the first task, not fixed at the end: the budgets below are enforced in CI from L-03 onward, and the techniques are already written into CLAUDE.md so Claude Code applies them in every task. If a budget fails, the task isn't done.

| Area | Budget (target) | How it's measured |
| --- | --- | --- |
| Website LCP (mobile, slow 4G) | < 2.5 s | Lighthouse CI on 10 key pages, en + ar |
| Website CLS / INP | < 0.1 / < 200 ms | Lighthouse CI + real-user Web Vitals to GA4 |
| Website JS per page | < 120 KB gzipped (quote form < 180 KB) | Next.js bundle analyser in CI |
| Portal first load | < 2 s on 4G; route changes < 300 ms | Playwright performance traces |
| Portal JS (initial) | < 250 KB gzipped, heavy widgets lazy | Bundle analyser |
| API reads | p95 < 300 ms, p99 < 800 ms | k6 load test + /metrics histograms |
| API writes | p95 < 500 ms (slow work queued) | k6 + metrics |
| Case list with filters (10k cases) | < 400 ms server time | k6 with seeded 10k-case dataset |
| Search typeahead | < 150 ms server time | k6 |
| Realtime update delivery | < 1 s between users | Playwright two-browser test |
| Notification send (queued → provider) | < 10 s p95 | Queue metrics |

**Techniques by layer**

- **Website:** static generation + on-demand ISR, everything served from CloudFront; server components by default; `next/image` with AVIF/WebP and correct sizes; fonts self-hosted with `next/font` and Arabic subset; third-party scripts (GA4, Pixel, Maps, video) loaded only after consent and interaction; video shows a poster until tapped; prefetch quote form on hover.
- **Portal:** route-level code splitting; TanStack Query caching with sensible staleTime, background refetch and realtime invalidation instead of polling; optimistic updates for tasks, notes, stage drags and chat; virtualised DataTable for long lists; skeletons instead of spinners; debounced filters synced to URL; heavy components (PDF viewer, editor, charts, maps, video) dynamically imported.
- **API:** Fastify adapter; select only needed columns; cursor pagination everywhere; indexes for every filter and sort; aggregated endpoints for dashboards with 30–60 s Redis cache; ETags on public endpoints; compression; connection pooling through RDS Proxy or PgBouncer; slow-query log at 200 ms reviewed weekly.
- **Background work:** anything that calls an external provider or takes over 200 ms (WhatsApp, email, PDFs, virus scans, exports, FX, translation) runs in the worker via BullMQ with retries; the request returns immediately and realtime pushes the result.
- **Files:** direct browser-to-S3 multipart uploads; thumbnails and previews generated once; downloads via short-lived signed URLs, never streamed through the API.
- **Database:** materialised views for reports refreshed every 15 minutes; partitioning AuditEvent and Message by month once they pass \~10 million rows; read replica for reports when needed.
- **Mobile networks:** compress API responses, keep payloads small, cache itinerary and documents list offline, resumable uploads, retry with backoff.

## 18. Security and compliance checklist

The platform holds foreign patients' medical records and passports, so one leak could end the business. This checklist is what the security-reviewer subagent and L-04 verify; tick each item before launch. It does not replace the external penetration test and the lawyer's review.

**Access control**

- [ ] Every endpoint has a permission; default deny; table-driven tests for all 11 roles (F-04)
- [ ] Object-level checks on every ID from the request (no IDOR): case, document, quote, payment, booking, message
- [ ] Agents never receive medical data; hospitals see only cases sent to them and consented documents
- [ ] Staff, hospital and admin accounts require 2FA; sessions revocable; impersonation read-only and audited

**Data protection**

- [ ] Private S3 bucket with SSE-KMS, versioning, no public ACLs; presigned URLs ≤ 5 minutes
- [ ] Virus scan before any document is viewable; quarantine on detection
- [ ] Watermarked downloads; audit event on every view and download; bulk-download alert
- [ ] RDS encrypted at rest; TLS everywhere; HSTS; secrets in AWS Secrets Manager, never in code or images
- [ ] Logs, Sentry, analytics and error messages free of PII and medical data (redaction tested)

**Application security**

- [ ] Zod validation on every input; rich text sanitised; file type checked by content, not only extension
- [ ] CSRF protection for cookie auth; strict CORS; CSP with nonces; frame-ancestors none; secure cookie flags
- [ ] Rate limits and lockouts on login, OTP, password reset, quote form, public search; Turnstile on public forms
- [ ] Payment webhooks verified by signature, processed idempotently; amounts always computed server-side
- [ ] Dependency audit, gitleaks, Trivy and ZAP baseline in CI

**Privacy and legal (India DPDP Act and patient-country expectations)**

- [ ] Explicit, purpose-specific consents with versions and withdrawal (P-01, W-08, W-12)
- [ ] Data-principal rights: access/export, correction, erasure workflow (L-06)
- [ ] Retention jobs running per policy; legal holds respected
- [ ] Grievance officer published; breach-response runbook with notification steps
- [ ] Primary data stored in AWS Mumbai region
- [ ] Disclaimers: facilitator not provider; referral-fee disclosure; AI assistant gives no diagnosis
- [ ] Lawyer reviewed policies and agreements; CA reviewed GST treatment

**Operations**

- [ ] Backups with point-in-time recovery, restore rehearsed; cross-region snapshot copy
- [ ] Alarms for errors, latency, queue backlog, failed payments, failed notifications
- [ ] Least-privilege IAM; MFA on AWS root and all admin consoles; access reviews quarterly
- [ ] External penetration test before launch and yearly after

## 19. Testing strategy and definition of done

Tests are what let you build fast with Claude Code without breaking last week's work: Claude Code runs them after every change and fixes what it broke before you ever see it. Aim for many fast unit and API tests, and a small number of end-to-end journeys.

| Level | Tool | What it covers | When it runs |
| --- | --- | --- | --- |
| Unit | Vitest | Services, stage machine, money maths, commission and referral-fee calculations, permission matrix, validators | Every save (watch), `pnpm check`, every PR |
| API e2e | Vitest + Supertest + Testcontainers Postgres | Every endpoint: happy path, validation error, forbidden role, not-found | `pnpm check`, every PR |
| Component | Vitest + Testing Library | Shared ui components, complex forms | Every PR |
| End-to-end | Playwright | Each new user flow (task level) + full journey suite (L-02) | Every PR (smoke), nightly (full) |
| Accessibility | @axe-core/playwright | Website pages and key portal screens | Nightly |
| Performance | Lighthouse CI, k6 | Budgets in section 17 | Every PR (Lighthouse), weekly + before release (k6) |
| Security | gitleaks, Trivy, pnpm audit, ZAP baseline | Secrets, images, dependencies, common web vulnerabilities | Every PR / nightly |

**Definition of done for every task**

- [ ] Meets the PRD section and the task's "Done when" line, checked by you in the browser
- [ ] Unit + API tests written, including a forbidden-role test; Playwright test for new user flows
- [ ] `pnpm check` green locally and in CI
- [ ] `/review-task` done; High/Medium findings fixed (`/security-check` too when data, auth, files or money are touched)
- [ ] Loading, error and empty states; works at 360 px; English and Arabic keys added
- [ ] Seed data extended so the feature can be demoed
- [ ] `docs/progress.md` updated; commit message starts with the task ID
- [ ] Deployed to staging by CI without errors in Sentry

## 20. Working tips and troubleshooting

These habits make the difference between Claude Code saving you months and Claude Code creating a mess you have to untangle.

**Go faster**

- **Run two tracks in parallel** with Git worktrees ([docs](https://code.claude.com/docs/en/worktrees)): one session on the CRM, another on the website, each in its own worktree and branch. Good pairs: C-tasks with W-tasks, H-tasks with LG-tasks, A-tasks with AD-tasks. Never run two sessions on the same module.
- **Show, don't describe, for UI.** Paste a screenshot of a design or a competitor screen into Claude Code with "build this layout with packages/ui components".
- **Let Claude Code check its own UI** with the Playwright MCP: "open /ops/cases, create a case, take a screenshot at 360 px and fix anything broken".
- **Use `/scaffold-module`** for every simple entity (masters, logistics, vendors); keep `/task` for business logic.
- **Batch small fixes:** collect UI nits from the day in a list and give them to one session at the end of the day.
- **Once a week, run a cleanup task:** "Find duplicated code, unused exports, inconsistent patterns and missing tests across the repo; propose a refactor plan; don't change behaviour."

**Keep quality high**

- Read every plan before approving. Most wrong turns are visible in the plan: a missing permission, the wrong table, a feature the PRD didn't ask for.
- Commit after every green task. A clean commit history is your undo button.
- Keep `docs/progress.md` and `docs/decisions/` current; new sessions read them and stay consistent.
- When you change your mind about a rule, update CLAUDE.md immediately so every future session follows it.
- Update dependencies monthly with a dedicated task, never in the middle of a feature.

**When things go wrong**

| Symptom | What to do |
| --- | --- |
| Claude Code keeps failing the same test | Stop. `git restore .`, split the task into smaller steps, give it the failing test output and ask for a root-cause explanation before any fix |
| Output ignores project patterns | Point to the exact reference file: "follow apps/api/src/modules/masters exactly"; add the missing rule to CLAUDE.md |
| Session getting slow or confused | Commit what works, `/clear`, start a fresh session with the task ID; it will re-read progress.md |
| Production bug | Paste the Sentry error and steps to reproduce: "write a failing test that reproduces this, then fix it" |
| Slow page or query | "Profile /ops/cases with 10k seeded cases; show EXPLAIN ANALYZE for the slowest queries; propose indexes and query changes" |
| Migration problem | Never edit a committed migration; ask for a new corrective migration and test it on a copy of staging data |
| Integration not working | Ask Claude Code to write a small script that calls the provider sandbox directly and logs the raw response, then fix the adapter |

**Daily rhythm that works**

1. Morning: pick the next 2–4 task IDs from `docs/progress.md`.
2. Run each through the build loop (section 1); commit after each.
3. Afternoon: click through staging, write the day's bug list, batch-fix it.
4. End of day: push, check CI and Sentry, update progress, note tomorrow's first task.
