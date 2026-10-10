# CI and staging deploy

Two GitHub Actions workflows live in `.github/workflows/`:

| Workflow | Runs on | Does |
| --- | --- | --- |
| `ci.yml` | every pull request, pushes to `develop`, manual | lint, typecheck, unit tests · API e2e against Postgres and Redis service containers · build all apps, boot the API and website, Playwright smoke test · build the four Docker images (not pushed) |
| `deploy-staging.yml` | push to `main`, manual | build the four images, push to Amazon ECR, roll the staging ECS services |

`develop` is checked on push because the build loop merges task branches into it without a pull
request. CI uses the pnpm store cache (through `actions/setup-node`) and a local Turborepo cache
(`.turbo`, through `actions/cache`).

The deploy workflow does **nothing** until the `AWS_ROLE_ARN` variable below is set, so merging to
`main` before AWS exists is safe. AWS itself is created with Terraform in task **L-05**; until
then these pages describe what the workflows expect it to look like.

## Docker images

| Image | Dockerfile | Notes |
| --- | --- | --- |
| `api`, `worker` | `infra/docker/node-service.Dockerfile` (`--build-arg APP=api`) | production dependencies and compiled output only, `pnpm deploy`ed |
| `web`, `portal` | `infra/docker/next-app.Dockerfile` (`--build-arg APP=web`) | Next.js standalone server |

All are multi-stage, based on `node:22-alpine`, and run as the unprivileged `node` user.
Build context is the repository root:

```bash
docker build -f infra/docker/node-service.Dockerfile --build-arg APP=api -t medtravel-api .
docker build -f infra/docker/next-app.Dockerfile --build-arg APP=web \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t medtravel-web .
```

- The Next apps bake `NEXT_PUBLIC_*` into the browser bundle, so they are **build arguments**: one
  image per environment. Everything else is read from the environment at runtime.
- The images contain no `.env` files (`.dockerignore` excludes them). Pass configuration through
  ECS task definition environment variables and Secrets Manager.
- The API listens on 3001 (`PORT`); the Next apps on 3000. The worker has no port: use the ECS
  container health check or a process check, not an HTTP one.
- The images do not contain the Prisma CLI, so they cannot run migrations. Migrations run as a
  separate one-off ECS task or a CI job with the CLI installed (set up in L-05).
- Alpine uses musl. When a native module such as `argon2` is added (F-03), confirm it has a musl
  build, or switch the base to `node:22-slim`.

## GitHub configuration

Set under **Settings → Secrets and variables → Actions**. Values that are not secret are
*variables*, not secrets. Set them as **repository** variables: the deploy job's `if` condition is
evaluated before the job's environment is applied, so a variable that exists only on the
`staging` environment is invisible to it and the deploy silently skips.

### Required for deploy

| Name | Kind | Example | Used for |
| --- | --- | --- | --- |
| `AWS_ROLE_ARN` | variable | `arn:aws:iam::123456789012:role/medtravel-staging-github-deploy` | IAM role the workflow assumes through GitHub OIDC. Setting it switches the deploy on. |
| `STAGING_API_URL` | variable | `https://api.staging.example.com` | Compiled into the web and portal bundles as `NEXT_PUBLIC_API_URL`. The deploy fails fast for web and portal if it is empty. |

There are **no AWS access keys** in GitHub: the workflow uses OIDC (`id-token: write`).

### Optional (defaults shown)

| Name | Kind | Default | Used for |
| --- | --- | --- | --- |
| `AWS_REGION` | variable | `ap-south-1` | Region of ECR and ECS |
| `ECS_CLUSTER` | variable | `medtravel-staging` | ECS cluster name |
| `ECS_SERVICE_PREFIX` | variable | `medtravel-staging` | Services are `<prefix>-api`, `-worker`, `-web`, `-portal` |
| `ECR_REPOSITORY_PREFIX` | variable | `medtravel` | Repositories are `<prefix>-api`, `-worker`, `-web`, `-portal` |
| `TURBO_TOKEN` | secret | unset | Turborepo remote cache; leave unset to use only the local cache |
| `TURBO_TEAM` | variable | unset | Turborepo remote cache team |

Also create a GitHub **environment** named `staging` (Settings → Environments). Add required
reviewers there if deploys should need approval.

## AWS resources the deploy expects

Created by Terraform in L-05; listed so they can be made by hand in the meantime.

1. **Four ECR repositories**: `medtravel-api`, `medtravel-worker`, `medtravel-web`, `medtravel-portal`.
2. **An ECS cluster** and **four Fargate services** named as above. Each task definition uses the
   matching repository with the tag **`staging`**.
3. **An IAM role** trusted by GitHub OIDC (identity provider `token.actions.githubusercontent.com`).
   Because the deploy job uses the `staging` environment, the token's subject is
   `repo:<org>/<repo>:environment:staging` and does **not** contain the branch. The trust policy
   condition must therefore be:
   - `token.actions.githubusercontent.com:aud` equals `sts.amazonaws.com`
   - `token.actions.githubusercontent.com:sub` equals `repo:<org>/<repo>:environment:staging`

   (A condition on `refs/heads/main` would never match and role assumption would fail.) Branch
   limiting is done in two other places: the workflow only deploys when `github.ref` is
   `refs/heads/main`, and the `staging` environment should restrict **Deployment branches** to
   `main` (Settings → Environments → staging).

   The role needs:
   - `ecr:GetAuthorizationToken`
   - `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`,
     `ecr:CompleteLayerUpload`, `ecr:PutImage`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`
     on the four repositories
   - `ecs:UpdateService` and `ecs:DescribeServices` on the four services
4. **Mutable image tags** on the four ECR repositories. `:staging` is pushed again on every
   deploy, so an immutable-tag repository (a common default in Terraform modules) makes the
   second deploy fail on `PutImage`.

### How a deploy rolls out

Each image is pushed twice: as `:<commit sha>` (immutable, for rollbacks) and as `:staging`. The
workflow then runs `aws ecs update-service --force-new-deployment` and waits for the service to
become stable, so ECS pulls the new `:staging` image. This keeps task definitions static. The
trade-off is that `:staging` is a moving tag; to roll back, retag the previous `:<sha>` as
`:staging` and force a deployment, or move to task-definition revisions pinned by digest when
Terraform is in place.

## Pull requests

`.github/pull_request_template.md` carries the checklist (task ID, tests, screenshots, migration).
Dependabot (`.github/dependabot.yml`) opens weekly, grouped update pull requests for npm and for
GitHub Actions. Docker base-image updates are manual: change `NODE_VERSION` in the Dockerfiles.

## Branch protection (required before deploys are enabled)

`deploy-staging.yml` runs on every push to `main` and does **not** wait for CI. Branch
protection is what guarantees only checked code reaches it, so set it on `main` (and `develop`)
**before** setting `AWS_ROLE_ARN`: require a pull request and require these status checks to pass.
Matrix jobs appear as separate checks and must each be added:

- `Lint, typecheck, unit tests`
- `API e2e (Postgres + Redis)`
- `Build all apps and browser tests`
- `Docker image (api)`, `Docker image (worker)`, `Docker image (web)`, `Docker image (portal)`

As a second line of defence the deploy boots each image (`scripts/smoke-image.sh`) before pushing it.

## Supply chain

Workflow actions are pinned by major version tag (`@v4`). The deploy workflow holds
`id-token: write`, so consider pinning the third-party actions in it (`aws-actions/*`,
`docker/*`) to commit SHAs; Dependabot can keep SHA pins updated.
