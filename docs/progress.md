# Build progress

Tick a task here when it is finished and `pnpm check` is green. The task queue that drives the
build loop is `loop/cloud-state.json`; this file is the human-readable view and also records
what each task deferred.

Tasks: 116 in the plan. Done: S-01 to S-05.

### Phase 0 — Scaffold (week 1)

- [x] **S-01** Monorepo scaffold
- [x] **S-02** Local services with Docker
- [x] **S-03** Claude Code configuration and progress tracker
- [x] **S-04** CI pipeline and staging deploy — CI green on `develop` (run 2); deploy workflow not yet run (see deferred notes)
- [x] **S-05** Design system (packages/ui)
- [ ] **S-06** App shells and layouts

### Phase 1A — Foundation (weeks 2–4)

- [ ] **F-01** Database schema
- [ ] **F-02** Master data module (the reference pattern)
- [ ] **F-03** Authentication
- [ ] **F-04** Roles, permissions and data scoping
- [ ] **F-05** Audit log and domain events
- [ ] **F-06** Secure file service
- [ ] **F-07** Notification engine
- [ ] **F-08** Realtime gateway
- [ ] **F-09** Money, currencies and languages
- [ ] **F-10** Case core and stage machine
- [ ] **F-11** Seed data and test factories
- [ ] **F-12** Observability

### Phase 1B — Coordinator CRM (weeks 5–7)

- [ ] **C-01** Lead capture and duplicate detection
- [ ] **C-02** Auto-assignment and SLA timers
- [ ] **C-03** Lead inbox and case pipeline
- [ ] **C-04** Case 360 view
- [ ] **C-05** Qualification
- [ ] **C-06** Medical review
- [ ] **C-07** Send to hospitals and track opinions
- [ ] **C-08** Quote builder
- [ ] **C-09** Tasks and reminders
- [ ] **C-10** Unified messaging
- [ ] **C-11** Visa tracker
- [ ] **C-12** Logistics board
- [ ] **C-13** Incidents and lost cases
- [ ] **C-14** Ops dashboard

### Phase 1C — Hospital and doctor portal (weeks 7–8)

- [ ] **H-01** Hospital onboarding and profile
- [ ] **H-02** Doctors and packages
- [ ] **H-03** Case requests inbox
- [ ] **H-04** Opinion and estimate form
- [ ] **H-05** Visa invitation letters
- [ ] **H-06** Admission and treatment updates
- [ ] **H-07** Doctor view (magic link)
- [ ] **H-08** Referral statements and performance

### Phase 1D — Patient portal (weeks 8–9)

- [ ] **P-01** Patient sign-up, login and attendants
- [ ] **P-02** My case dashboard
- [ ] **P-03** Medical records vault
- [ ] **P-04** Opinions and quotes
- [ ] **P-05** Payments and invoices
- [ ] **P-06** Visa centre
- [ ] **P-07** Itinerary
- [ ] **P-08** Messages
- [ ] **P-09** Feedback and reviews

### Phase 1E — Public website and SEO (weeks 9–11)

- [ ] **W-01** SEO foundation
- [ ] **W-02** Home page
- [ ] **W-03** Treatment pages
- [ ] **W-04** Hospital pages
- [ ] **W-05** Doctor pages
- [ ] **W-06** Search
- [ ] **W-07** Cost estimator
- [ ] **W-08** Free quote form
- [ ] **W-09** City and destination pages
- [ ] **W-10** Blog and guides
- [ ] **W-11** Partner pages
- [ ] **W-12** Legal pages and consent
- [ ] **W-13** Analytics and tracking

### Phase 1F — Agent portal (week 11)

- [ ] **A-01** Agent registration and KYC
- [ ] **A-02** Refer a patient
- [ ] **A-03** My referrals
- [ ] **A-04** Commission plans and statements
- [ ] **A-05** Payouts

### Phase 1G (weeks 6–12, interleaved) — Admin

- [ ] **AD-01** Users and roles
- [ ] **AD-02** Hospital and doctor approvals
- [ ] **AD-03** Agent approvals and commission plans
- [ ] **AD-04** CMS
- [ ] **AD-05** Pricing rules and FX
- [ ] **AD-06** Templates
- [ ] **AD-07** Settings and audit viewer

### Phase 1G (weeks 6–12, interleaved) — Finance

- [ ] **FI-01** Invoicing
- [ ] **FI-02** Payment collection
- [ ] **FI-03** Refunds
- [ ] **FI-04** Hospital referral fees
- [ ] **FI-05** Agent commissions and payouts

### Phase 1G (weeks 6–12, interleaved) — Logistics (build before C-12)

- [ ] **LG-01** Stays
- [ ] **LG-02** Transport
- [ ] **LG-03** Interpreters
- [ ] **LG-04** Flight bookings

### Phase 1G (weeks 6–12, interleaved) — Reports

- [ ] **R-01** Reports module
- [ ] **R-02** Management dashboard

### Phase 1H — Hardening, compliance and launch (weeks 13–16)

- [ ] **L-01** Integration completion
- [ ] **L-02** End-to-end journey tests
- [ ] **L-03** Performance pass
- [ ] **L-04** Security hardening
- [ ] **L-05** Production infrastructure
- [ ] **L-06** Privacy and DPDP features
- [ ] **L-07** Accessibility, RTL and content QA
- [ ] **L-08** UAT and data loading (human + Claude Code)
- [ ] **L-09** Go-live checklist (human)
- [ ] **L-10** Post-launch loop

### Phase 2 — Scale operations (months 5–8)

- [ ] **M-01** Patient mobile app
- [ ] **M-02** Ground coordinator app
- [ ] **T-01** Video teleconsults
- [ ] **T-02** Cloud telephony
- [ ] **T-03** Auto-translation
- [ ] **T-04** More languages and compare
- [ ] **T-05** Stay, add-ons and expense tracker
- [ ] **T-06** In-treatment updates for family
- [ ] **T-07** Follow-up care and emergency
- [ ] **T-08** Finance phase 2
- [ ] **T-09** e-Signature
- [ ] **T-10** Hospital groups and performance
- [ ] **T-11** Agent growth tools

### Phase 3 — Grow and automate (months 9–12)

- [ ] **G-01** AI website assistant
- [ ] **G-02** Hospital API
- [ ] **G-03** Agent tiers and leaderboard
- [ ] **G-04** Patient referral rewards
- [ ] **G-05** Flight tracking
- [ ] **G-06** More markets and wellness
- [ ] **G-07** Welcome kit inventory
- [ ] **G-08** Advanced analytics

## Notes and deferred work

### Deferred from S-05

- A native-speaker review of the Arabic (`packages/i18n/REVIEW.md`), especially `stages.*` and the brand name.
- Confirm the brand colours and fonts (placeholders in the task; blue, amber, Inter + Noto Sans Arabic chosen).
- A dark-mode toggle (the tokens and components are ready; the apps do not switch yet).
- Real S3 signing for `FileUploader` comes from the file service (F-06); the gallery uses a mock endpoint.
  Resuming an upload after a page reload is not included (needs the API to track upload ids).
- `/ui-gallery` is opt-in via `ENABLE_UI_GALLERY=true`; add the line to an existing `apps/portal/.env`.
- DataTable column filters: callers put them in the `toolbar` slot and refetch; no built-in filter UI.
- Not exercised with a real screen reader; automated accessibility checks (axe) pass.
- TanStack Table 9 and react-day-picker 10 exist; the 8.x and 9.x lines are used.
- The CI job that builds and runs browser tests was renamed "Build all apps and browser tests"; update
  branch protection if it was already set.

### Deferred from S-04

- **Verified on GitHub:** `ci.yml` ran green on `develop` (run 2: lint/typecheck/tests, API e2e,
  build + Playwright, all four image builds and boots). Run 1 had caught a flaky check in
  `scripts/smoke-image.sh`, since fixed.
- **Not yet verified:** CI on an actual pull request (it ran on a push to `develop`), and the whole
  deploy workflow, which has never run and needs the AWS role, ECR repositories and ECS services (L-05).
- Set the repository variables in `docs/deploy.md` and enable branch protection on `main`/`develop`.
- Image sizes (measured): api 469 MB, worker 470 MB, web and portal 320 MB; the `node:22-alpine`
  base is about 238 MB of that. Consider a smaller base if size matters.
- Migrations are not run by the images (no Prisma CLI inside); L-05.
- Re-check Alpine compatibility when `argon2` is added (F-03).
- `turbo run test` warns "no output files found" because `turbo.json` declares `coverage/**`
  outputs that tests do not produce. Harmless; left alone.

### Deferred from S-03

- Confirm in a new Claude Code session that `/task` appears in the slash menu and that the hooks
  fire (skills and settings load at session start, so this could not be checked in the build session).
- `CLAUDE.md` says "plan first, wait for approval"; unattended runs override that
  (`loop/prompts/autonomous-rules.md`).
- The `scaffold-module` skill points at `apps/api/src/modules/masters`, which F-02 creates.

### Deferred from S-02

- **Unverified:** the MinIO services and the single `pnpm dev` command end to end (the network
  policy here blocks `quay.io`). Run `pnpm dev` once on an unrestricted machine.
- Pin `minio` / `mc` / `mailpit` image tags once the current releases are confirmed.
- The API and worker env schemas do not read the S3, SMTP and ClamAV variables yet; the files
  and notifications modules add them.
- Shared packages are built once at `pnpm dev` start, not watched.

### Deferred from S-01

- The API and worker boot without Postgres, because nothing queries the database yet; the
  worker needs Redis.
- Real `/health` readiness checks for Postgres and Redis (L-02).
- `apps/mobile` (Expo) is Phase 2 and not created.
- Playwright runs against already-running apps and is not part of `pnpm check`; use `pnpm e2e`
  (set `CHROMIUM_PATH` to use an existing Chromium).
- `pnpm --filter @medtravel/api openapi:export` uses POSIX `${VAR:-default}` env syntax, so it
  needs a POSIX shell (Linux, macOS, CI, WSL).
- Prisma has no models yet; `db:migrate` has nothing to apply until F-01.
