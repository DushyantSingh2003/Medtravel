# Build progress

Updated by each build task. The queue itself lives in `loop/cloud-state.json`.

## Foundation

- [x] **S-01** Monorepo scaffold — pnpm + Turborepo, 4 apps, 8 packages, `pnpm check` and `pnpm build` green.
- [ ] S-02 Local services with Docker
- [ ] S-03 – S-06

### Deferred from S-01

- `infra/docker-compose.yml` (S-02). The API and worker boot without Postgres, because nothing
  queries the database yet; the worker needs Redis.
- Real `/health` readiness checks for Postgres and Redis (L-02).
- `apps/mobile` (Expo) is Phase 2 and not created.
- Playwright runs against already-running apps and is not part of `pnpm check`; use `pnpm e2e`
  (set `CHROMIUM_PATH` to use an existing Chromium).
- `pnpm --filter @medtravel/api openapi:export` uses POSIX `${VAR:-default}` env syntax, so it
  needs a POSIX shell (Linux, macOS, CI, WSL).
- Prisma has no models yet; `db:migrate` has nothing to apply until F-01.
