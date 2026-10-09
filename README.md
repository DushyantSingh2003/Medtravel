# MedTravel

A medical travel platform: patients share reports, receive an expert opinion and a quote, and travel with everything arranged. One TypeScript monorepo.

Product requirements are in [`docs/PRD.md`](docs/PRD.md) and the build plan in [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

## Getting started

**You need:** Node 22, pnpm 10, and Docker with Compose v2. (`nvm use` picks Node 22 from `.nvmrc`; `corepack enable` provides pnpm.)

```bash
git clone <repo-url> medtravel && cd medtravel
pnpm install
pnpm dev
```

`pnpm dev` does everything else:

1. creates a local `.env` next to every `.env.example` that does not have one (development defaults that match the containers; `.env` files are gitignored),
2. starts the containers and waits until every one is healthy (the first run pulls images and ClamAV loads its virus database, so allow a few minutes),
3. builds the shared packages, then runs the API, worker, website and portal in parallel with Turborepo.

Stop the apps with `Ctrl+C`. The containers keep running; stop them with `pnpm infra:down`.

### Local URLs

| What | URL | Notes |
| --- | --- | --- |
| Website | http://localhost:3000 | `/en` and `/ar` (right-to-left) |
| Portal | http://localhost:3002 | patient, ops, hospital, agent and admin portals |
| API | http://localhost:3001 | health check at `/health` |
| API docs (Swagger) | http://localhost:3001/docs | OpenAPI JSON at `/docs-json` |
| Mailpit (email inbox) | http://localhost:8025 | every outgoing email lands here |
| MinIO console | http://localhost:9001 | login `medtravel` / `medtravel-secret` |
| MinIO S3 API | http://localhost:9000 | buckets `medtravel-private` and `medtravel-public` |
| PostgreSQL 16 | `localhost:5432` | database, user and password all `medtravel`; `pg_trgm` and `unaccent` enabled |
| Redis 7 | `localhost:6379` | |
| SMTP (Mailpit) | `localhost:1025` | no authentication |
| ClamAV | `localhost:3310` | clamd TCP socket |

If a port is taken, copy the root `.env.example` to `.env` and change it (for example `POSTGRES_PORT=5433`), then update the matching URL in the app's `.env`.

### Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | start containers, then every app |
| `pnpm infra:up` / `infra:down` | start / stop the containers |
| `pnpm infra:reset` | stop the containers **and delete their data** |
| `pnpm infra:logs` | follow the container logs |
| `pnpm check` | lint, typecheck and test every workspace |
| `pnpm build` | build every workspace |
| `pnpm e2e` | Playwright end-to-end tests against the running apps (`CHROMIUM_PATH` uses an existing Chromium) |
| `pnpm api:generate` | export the OpenAPI document and regenerate the typed API client |
| `pnpm db:migrate` / `db:seed` / `db:studio` | database workflow (Prisma) |

### Things to know

- The shared packages (`@medtravel/contracts`, `ui`, `i18n`, ...) are compiled once when `pnpm dev` starts. If you edit one while the apps are running, run `pnpm build` and restart the affected app.
- The first start of an empty database runs `infra/postgres/init/01-extensions.sql`. To re-run it, use `pnpm infra:reset`.

## CI and deploy

Pull requests run lint, typecheck, unit tests, API e2e, a full build with a Playwright smoke test, and a build-and-boot check of every Docker image. Merging to `main` deploys to staging once AWS is configured. See [`docs/deploy.md`](docs/deploy.md) for the workflows, the images and the GitHub variables they need.

## Layout

```
apps/      api (NestJS) · worker (BullMQ) · web (Next.js website) · portal (Next.js app)
packages/  db · contracts · api-client · ui · i18n · emails · pdf · config
infra/     docker-compose.yml and container init scripts
e2e/       Playwright tests
docs/      PRD, build plan, progress, per-task plans
```
