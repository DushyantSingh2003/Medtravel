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
