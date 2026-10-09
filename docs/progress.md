# Build progress

Updated by each build task. The queue itself lives in `loop/cloud-state.json`.

## Foundation

- [x] **S-01** Monorepo scaffold — pnpm + Turborepo, 4 apps, 8 packages, `pnpm check` and `pnpm build` green.
- [x] **S-02** Local services with Docker — compose stack, `pnpm dev`, README. MinIO container not verified here (see below).
- [ ] S-03 – S-06

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
