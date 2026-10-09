# Run the build loop in Claude Code cloud (no server needed)

A **routine** runs every hour as a fresh cloud session on your GitHub repo. Each run:

1. reads `loop/cloud-state.json` to find the next task;
2. claims it;
3. builds it with tests;
4. gets an independent review from a subagent;
5. merges it into `develop` and pushes.

The state lives in the repo, so every run knows where the last one stopped. If a run is still working when the next hour starts, the new run sees the claim and exits at once. If Claude usage limits are reached, runs are skipped until your usage resets, and then the loop simply continues.

Cloud sessions already include Docker, PostgreSQL 16, Redis, Node 22 and pnpm, on 4 vCPU, 16 GB RAM and 30 GB disk, so the whole plan can run there. Routines use your normal Claude subscription usage; there is no extra compute charge.

## One-time setup (about 15 minutes)

### 1. Fix the default branch

Your repo's only branch is `claude/tender-cori-8d1c9t`. On GitHub, open **Branches**, click the pencil icon next to it and rename it to **`main`**. It is the default branch, so routines start from it.

### 2. Make sure the latest loop files are on `main`

`main` needs `loop/cloud.mjs`, `loop/CLOUD.md`, `loop/CLOUD-SETUP.md` and the updated `loop/config.json`, next to `docs/PRD.md` and `docs/BUILD_PLAN.md`.

### 3. Create a cloud environment for the build

Go to [claude.ai/code](https://claude.ai/code), open the environment selector, and create a new environment named **medtravel-build**.

**Network access:** Custom. Tick **Also include default list of common package managers** and add these allowed domains (Playwright browser downloads):

```
cdn.playwright.dev
playwright.download.prss.microsoft.com
playwright.azureedge.net
```

**Environment variables:**

```
BASH_DEFAULT_TIMEOUT_MS=600000
BASH_MAX_TIMEOUT_MS=1800000
CI=true
```

**Setup script** (pre-pulls the Docker images the project uses, so every run starts faster):

```bash
#!/bin/bash
corepack enable || true
for img in postgres:16 redis:7 minio/minio:latest axllent/mailpit:latest clamav/clamav:stable; do
  docker pull "$img" || true
done
exit 0
```

### 4. Create the routine

Go to [claude.ai/code/routines](https://claude.ai/code/routines) and click **New routine**.

- **Name:** MedTravel build loop
- **Model:** Opus. Don't pick Fable for a loop: on some plans it bills usage credits without asking.
- **Repository:** your `Medtravel` repo
- **Environment:** medtravel-build
- **Trigger:** Schedule → Hourly. To start near the top of the hour, pick a time like :07 rather than :00.
- **Connectors:** remove all of them; the loop doesn't need any.
- **Prompt:**

```text
You are the autonomous build loop for the MedTravel platform. Do exactly one build task in this run by following loop/CLOUD.md in this repository step by step, without asking questions. You are allowed to push to the develop, task/* and wip/* branches of this repository as loop/CLOUD.md describes. Never push to main, never force-push. End with the short report described in step 10 of loop/CLOUD.md.
```

Click **Create**, then **Run now**, and open the run to watch task S-01 being built.

## Daily use

| You want to… | Do this |
| --- | --- |
| See what each run did | Open the run at claude.ai/code (each run is a session), or in the Claude mobile app |
| See overall progress | Open `loop/cloud-state.json` on the `develop` branch in GitHub, or ask any cloud session to run `node loop/cloud.mjs status` |
| Approve a checkpoint (before C-01, L-01, M-01) | On GitHub, switch to `develop` → **Add file → Create new file** → name it `loop/commands/approve-C-01` → commit. The next run applies it. |
| Retry a failed task | Create `loop/commands/retry-F-06` the same way |
| Skip a task | Create `loop/commands/skip-W-09` |
| Mark a human task done | Create `loop/commands/done-L-09` |
| Pause everything | Turn the routine's switch off at claude.ai/code/routines |
| Run the next task now | **Run now** on the routine |

Every day:
- Read `docs/questions.md` on `develop` to see the assumptions Claude made.
- Click through the new features.
- Merge `develop` into `main` yourself when you're happy. The loop never touches `main`.

## Where it stops on its own

| When | Why |
| --- | --- |
| Before **C-01** | Review the foundation once before 90 more tasks build on it |
| Before **L-01** | The MVP is complete; review it before hardening |
| At **L-09** | Go-live checklist is human work |
| Before **M-01** | Phase 2 and 3 start only after you set `"includeLaterPhases": true` in `loop/config.json` |
| A task fails twice | Its work is saved on a `wip/…` branch and the reason is in `loop/cloud-state.json` |

## Pace and usage

- The fastest the loop can go is one task per hour, because hourly is the shortest routine schedule. That's up to 24 tasks a day, so the 95 MVP tasks need at least 4 days of running. In practice your subscription's usage limits set the pace.
- For faster progress, start an extra run with **Run now** when no run is in progress. The claim system stops two runs from building the same task.
