# 001 — Architecture and stack

- **Status:** accepted
- **Date:** 2026-10-09
- **Source:** `docs/BUILD_PLAN.md` section 3. Versions below are what S-01 actually installed.

## Context

MedTravel takes international patients from enquiry to treatment in accredited Indian hospitals.
It has five audiences (patient, coordinator/ops, hospital, agent, admin), medical documents that
must stay private, work that is slow and external (WhatsApp, email, PDFs, virus scans) and a
public website that must rank and load fast. It is built by a small team working with Claude Code,
so the structure favours patterns that are easy to repeat and a codebase one session can see whole.

## Decision

One TypeScript monorepo (pnpm workspaces + Turborepo) with four deployable apps and shared
packages.

| Layer              | Choice                                                                                                 | Why                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Monorepo           | pnpm + Turborepo                                                                                       | One repo to read; cached builds and tests                                                    |
| API                | NestJS on Fastify, `nestjs-zod`, OpenAPI                                                               | A module pattern that repeats well; Fastify is faster than Express                           |
| ORM / database     | Prisma + PostgreSQL 16, `pg_trgm` and full-text search                                                 | Type-safe queries and migrations; no separate search engine at MVP                           |
| Validation / types | Zod in `packages/contracts`, shared by API and UI                                                      | One schema is the API validation, the form validation and the type                           |
| API client         | orval generates TanStack Query hooks from the OpenAPI document                                         | No hand-written fetch code; the front end cannot drift from the API                          |
| Queues             | Redis + BullMQ in `apps/worker`                                                                        | Slow work never blocks a request                                                             |
| Realtime           | Socket.IO with the Redis adapter                                                                       | Live chat, case updates, notifications                                                       |
| Website            | Next.js App Router, static generation + ISR                                                            | Served from a CDN; strong Core Web Vitals and SEO                                            |
| Portal             | One Next.js app, role-based route groups (`/patient /ops /hospital /agent /admin`)                     | Login, layout, tables, forms, chat and uploads are built once and reused by all five portals |
| UI                 | Tailwind + shadcn/ui + lucide, RTL through logical CSS properties                                      | Fluent to generate; Arabic right-to-left from day one                                        |
| i18n               | next-intl for UI text, translation tables for database content                                         |                                                                                              |
| Auth               | Own module: argon2, OTP (email/SMS/WhatsApp), TOTP 2FA, httpOnly cookie sessions with refresh rotation | Full control over 11 roles on one domain                                                     |
| Permissions        | CASL abilities from one permission matrix in `contracts`                                               | The same rules are enforced in the API and used to hide UI                                   |
| Files              | S3 presigned multipart upload, ClamAV scan, pdf-lib watermark                                          | Large uploads go straight to S3; medical files only ever via short-lived signed links        |
| PDFs               | `@react-pdf/renderer` in the worker                                                                    | Branded quotes, invoices, statements                                                         |
| Email              | React Email + Amazon SES                                                                               | Templates in code, versioned                                                                 |
| Testing            | Vitest, Testcontainers (real Postgres), Playwright, MSW                                                | Every test can run locally                                                                   |
| Infrastructure     | Docker; AWS ECS Fargate, RDS, ElastiCache, S3, CloudFront, SES; Terraform                              | India data residency; infrastructure as code                                                 |
| Observability      | Sentry, pino JSON logs to CloudWatch, uptime checks                                                    | Errors visible within minutes                                                                |

Domains: `www` (website), `app` (all portals), `api` (API + WebSocket), `files` (CDN for public
images only; medical files always through signed links).

## Versions as built (S-01)

The plan assumed older majors. The registry now serves newer ones and the official generators
produce a different shape, so the build follows the generators.

Next.js 16, React 19, Tailwind 4 (CSS-first, no JavaScript config), NestJS 12 (ESM), Zod 4,
Prisma 7 (pg driver adapter; connection URL in `prisma7.config.ts`), next-intl 4, Vitest 4,
TypeScript 6, ESLint 9 with one shared flat config. Prisma is pinned to 7.x because its `latest`
tag is a release candidate. `nestjs-zod` declares a peer range that excludes Nest 12 but works
and is covered by the API e2e test.

## Consequences

- Five portals as one app is the largest time saver, and also the largest blast radius: a broken
  shared layout breaks all of them. Route-group boundaries and role checks must be tested.
- Everything shares one Prisma schema and one Postgres, so schema changes are coordinated.
- Shared packages compile to `dist`; editing one while the apps run needs a rebuild.
- Heavy dependence on code generation (OpenAPI → client): `pnpm api:generate` must run after any
  API change.
- Newer majors than the plan means fewer worked examples to copy from; check each library's
  current docs before using an API from memory.
