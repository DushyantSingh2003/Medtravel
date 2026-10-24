# Build progress

Tick a task here when it is finished and `pnpm check` is green. The task queue that drives the
build loop is `loop/cloud-state.json`; this file is the human-readable view and also records
what each task deferred.

Tasks: 116 in the plan. Done: S-01 to S-06, F-01, F-02, F-03.

### Phase 0 — Scaffold (week 1)

- [x] **S-01** Monorepo scaffold
- [x] **S-02** Local services with Docker
- [x] **S-03** Claude Code configuration and progress tracker
- [x] **S-04** CI pipeline and staging deploy — CI green on `develop` (run 2); deploy workflow not yet run (see deferred notes)
- [x] **S-05** Design system (packages/ui)
- [x] **S-06** App shells and layouts

### Phase 1A — Foundation (weeks 2–4)

- [x] **F-01** Database schema
- [x] **F-02** Master data module (the reference pattern)
- [x] **F-03** Authentication
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

### Deferred from F-03

- **Not yet verified on GitHub:** the browser job now seeds the development users with two-factor enrolment
  (`SEED_DEV_USERS=true SEED_DEV_2FA=true`), starts the API as `NODE_ENV=test` with a relaxed rate limit, and the
  image smoke test expects `/docs` 404 and `/masters/countries` 401 in production mode. The F-02 CI run failed only
  on that image smoke test (`/docs` is off in production); the smoke script was fixed in this task.
- Mail goes through a `capture` transport by default and SMTP when configured; real templates, SMS and WhatsApp
  delivery of codes arrive with F-07, so one-time codes are not yet delivered by phone.
- The login throttle and lockout counters live in the API process (in memory). Move them to Redis before running more
  than one API instance.
- `AUTH_TOKEN_SECRET` and `AUTH_ENCRYPTION_KEY` have development defaults that production refuses; set real values and
  a rotation plan at deployment. No key rotation for the encrypted TOTP secrets yet (the `v1.` prefix leaves room).
- No "remember this device" for two-factor, no WebAuthn, no phone verification flow, no admin screens to unlock a
  user or reset their second factor (F-18 user management).
- The portal's Arabic auth strings are machine drafts (`packages/i18n/REVIEW.md`).
- The stub sign-in (`ENABLE_STUB_AUTH`) is gone; an existing `apps/api/.env` can drop that line. The permission matrix is
  still the interim one (F-04).
- **From the F-03 reviews, fixed:** magic-link sessions refresh (without lengthening) and are refused by every route that does
  not carry `@AllowMagicLink()`; a link no longer enrols another hospital's doctor; a racing refresh gets 409 and keeps its
  cookies; the replay grace runs from `rotatedAt`; the browser client retries only `session_expired` 401s; a locked account
  answers like a wrong password; a sign-in code claims an account registered unverified by someone else; turning on
  two-factor signs the other devices out; invitation tokens are scrubbed from request logs; production needs
  `TRUST_PROXY_HOPS` and the dev seed refuses to run outside development and test.
- **From the F-03 reviews, not done (owners in brackets):** (1) `scopeCaseId` is only kept by the deny-by-default guard;
  case endpoints must filter by it (F-04, F-10). (2) First-time two-factor enrolment needs only the password the limited
  session proved; bind it to an emailed code or the invitation. (3) Codes by phone are accepted but not delivered until
  F-07. (4) No way yet to create an agent account (needs an agent invitation, F-18). (5) Lockout and OTP attempt counters are
  not atomic and the limiter is per process (Redis before more than one API instance); a stranger can lock a known account
  for 15 minutes. (6) A TOTP code and the 2FA challenge token can be replayed within their window; store the last step.
  (7) Patients can probe which emails have accounts through invitations (answer 202 either way). (8) The refresh session
  slides for ever, with no absolute cap and no cleanup job for old sessions and challenges. (9) OTP-only accounts cannot
  set a password. (10) Mail is sent inside the request (move to the outbox, F-07). (11) Cookies are `Path=/` with an
  optional parent `Domain`; prefer the same host or `__Host-` names at deployment. (12) Security defaults depend on
  `NODE_ENV`; deployments must set it to `production`. (13) The magic link redeems on page load, so a mail scanner can
  burn it; add a confirm button, and consider a second factor for doctors. (14) Registration lets an unverified account
  sign in; consider holding the password until the address is verified.
- The browser test that walks an un-enrolled staff user through two-factor set-up can run once per database (it enrols
  the user); it skips itself when the user is already enrolled.

### Deferred from F-02

- **Not yet verified on GitHub:** the browser job now needs a Postgres service, the migrate and seed step, and
  an API started with the stub sign-in; the first CI result is recorded here once it has run.
- The stub sign-in (`ENABLE_STUB_AUTH`, API and portal) stands in for F-03; `can()` in `packages/contracts` is an
  interim matrix (F-04). Neither may stay on a deployed environment.
- An existing `apps/api/.env` needs `ENABLE_STUB_AUTH=true` added by hand to use the admin screens locally
  (`.env` files are never edited by the build).
- API error messages are English; the admin form shows them as they are on the field. Localised API errors are
  not done.
- The public website still reads nothing from the master data API (needs a public, cached read endpoint, with the
  CMS and the cost calculator).
- No restore for countries, languages and currencies (they cannot be deleted, only deactivated), and no bulk
  actions or import/export beyond the table's CSV export of the visible page.
- Optimistic updates are not used: after a change the list is refetched (`invalidateQueries`), which was fast enough and
  keeps the cursor pages honest.
- The Arabic seed names are machine drafts: 245 country names come from CLDR (reliable), the 25 specialities,
  60 treatments, 15 cities, document types and lost reasons were drafted by hand (`packages/i18n/REVIEW.md`).

- From the F-02 review, not done: (1) saving translations replaces all of a row's translations, which is only safe
  while Arabic is the one translated language; make it per locale before a third language is added. (2) Validation
  messages in `packages/contracts` are English, so Arabic users see them on fields. (3) The seed re-adds a machine
  Arabic name that an admin cleared. (4) Seed country names depend on the Node ICU version. (5) `trustProxy: true`
  trusts any forwarded IP in the audit trail; set the real hop count at deployment. (6) Updates read the row
  without a lock, so two simultaneous edits can record a stale `before`.
- Sorting by a nullable column (typical stay) was removed: a cursor cannot page across NULLs.

### Deferred from F-01

- **Verified on GitHub:** `ci.yml` run 11 on `develop` (commit 5ba538a) passed, including the database tests in the
  API e2e job (`pnpm --filter @medtravel/db test:e2e` against the Postgres service container).
- Money columns are `BigInt` (ADR 002). Prisma returns them as `bigint`; the API layer (F-02 onward) must
  serialise them as strings.
- `AuditEvent` is append-only through triggers a table owner could drop: in production the application role must
  not own the tables (deployment task).
- `Patient.passportNumber` is in the search vector as the task asks (clear text); see `docs/questions.md`.
- The migration enables `pg_trgm` and `unaccent` itself (trusted extensions, PostgreSQL 13+). On a managed
  database whose owner role cannot create extensions, create them once by hand before `migrate deploy`.
- Bank and payout details and passport numbers are plain columns the application is expected to encrypt (F-03/F-06);
  nothing in the schema does it. Passport search needs the value readable (or a blind index).
- The Arabic names in the seed (countries, cities, treatments, ...) are machine drafts (`packages/i18n/REVIEW.md`).
- Seed covers master data only; one user per role, hospitals, doctors and cases come with F-11.

### Deferred from S-06

- **Verified on GitHub:** `ci.yml` run 8 on `develop` (commit 2f3e298) passed all 7 jobs: lint/typecheck/unit tests,
  API e2e, build + Playwright (website, portal shell and gallery: 164 tests), and the four image builds and
  boots (the portal image's `/ar` smoke check included).
- **Real sign-in.** The portal login is a stub: `ENABLE_STUB_AUTH=true` lets anyone pick any of the
  eleven roles. It is off unless that variable is set (`apps/portal/.env.example` and the CI browser job
  set it; an existing `apps/portal/.env` needs the line added). F-03 replaces it; the guards
  (`requirePortalSession`) and the shell stay. Never enable it on a deployed environment.
- **Role-level menus.** One role sees its whole portal's menu (an interpreter sees all of the coordinator
  portal, finance sees all of admin). Hiding screens per role needs the permission matrix (F-04).
- **Every screen is a placeholder** (79 portal screens, 15 public pages) with its PRD priority shown.
  Each fills in with its own task. Search, notifications and the currency choice are UI only for now.
- **Public site settings.** Set `NEXT_PUBLIC_WHATSAPP_NUMBER` (the floating button is hidden without it)
  and `NEXT_PUBLIC_SITE_URL` (canonical links and the sitemap) as build arguments: the Docker image and the
  deploy workflow take them from the optional repository variables `STAGING_WHATSAPP_NUMBER` and
  `STAGING_SITE_URL` (see `docs/deploy.md`). The browser tests need the website **built with a WhatsApp
  number** (CI sets a placeholder one).
- **Brand mark and favicons** are a simple placeholder (blue rounded square, white cross, amber arc);
  replace with the real logo when there is one (`apps/*/app/icon.svg`, `favicon.ico`, `apple-icon.png`,
  `public/icon-*.png`).
- The Arabic for the menus, page descriptions, login and error pages is a machine draft
  (`packages/i18n/REVIEW.md`).
- Website menus are plain links to index pages; mega-menus that list treatments and hospitals need CMS content.

### Deferred from S-05

- **Verified on GitHub:** `ci.yml` run 5 on `develop` (commit cb46848) passed all 7 jobs: lint/typecheck/unit tests,
  API e2e, build + Playwright (website smoke and gallery), and the four image builds and boots.
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
