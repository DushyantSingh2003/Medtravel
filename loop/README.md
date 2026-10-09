# MedTravel autonomous build loop

This folder turns the build plan into a loop that runs on your server without you pasting prompts. For every task in `docs/BUILD_PLAN.md` it:

1. creates a branch `task/<id>-…` from `develop`
2. runs Claude Code headless (`claude -p`) with the task prompt plus autonomous rules (`prompts/autonomous-rules.md`)
3. re-runs `pnpm install` and `pnpm check` itself, and sends failures back to the same Claude session (up to 3 fix rounds)
4. asks a separate read-only Claude reviewer to check the change, and fixes critical/high/medium findings (plus a security review for sensitive tasks)
5. commits, merges into `develop`, pushes, notifies you, and starts the next task

It stops at checkpoints, on failures it can't fix, at human-only tasks, when the budget cap is reached, or when you tell it to. Each Claude run starts fresh, so context never fills up, and the runner, not Claude, decides whether a task passed.

## What you need

| Item | Recommendation |
| --- | --- |
| Server | Ubuntu 24.04, 4 vCPU, 8 GB RAM (16 GB is more comfortable), 80 GB SSD. Use it only for this job. |
| Claude account | A Max subscription with a `claude setup-token` token is usually cheapest for continuous use. The runner waits out usage limits and continues by itself. An API key works too, but billing is per use, so set `maxTotalUsd`. |
| GitHub | A private repo with `main` containing `docs/PRD.md`, `docs/BUILD_PLAN.md` and this `loop/` folder. |
| Optional | Telegram bot or Slack/Discord webhook for progress messages. |

The $50/month server covers hosting the loop only. Claude usage is billed separately by your Claude plan or API account.

## Setup (once, about 30 minutes)

1. **Prepare the repo on your computer.** Unzip `medtravel-repo-starter.zip` into your new repo's root, so you have `docs/PRD.md`, `docs/BUILD_PLAN.md` and `loop/`. Commit and push to `main`. (If you edit the plan or PRD docs later, export them again as Markdown to the same paths.)
2. **Set up the server.** Copy the setup script to the server and run it as root:
   ```bash
   scp loop/setup-server.sh root@<server-ip>:/root/
   ssh root@<server-ip> "bash /root/setup-server.sh git@github.com:<you>/<repo>.git"
   ```
3. **Add the deploy key** the script prints to GitHub → repo → Settings → Deploy keys, with **Allow write access** ticked.
4. **Clone as the build user:** `sudo -iu builder git clone <your-repo-ssh-url> ~/medtravel`
5. **Add your Claude token.** On your own computer run `claude setup-token`, approve in the browser, and paste the token into `/home/builder/.config/medtravel-loop/env` as `CLAUDE_CODE_OAUTH_TOKEN=…`. Add Telegram or webhook settings if you want notifications.
6. **Preflight and first task, watched by you:**
   ```bash
   sudo -iu builder
   cd ~/medtravel && set -a && . ~/.config/medtravel-loop/env && set +a
   node loop/runner.mjs check      # everything should show ✔
   node loop/runner.mjs once       # runs S-01; in a second terminal: node loop/runner.mjs watch
   ```
7. **Let it run on its own:**
   ```bash
   sudo systemctl enable --now medtravel-loop
   journalctl -u medtravel-loop -f          # runner log
   ```

## Daily use

| You want to… | Run (as `builder` in `~/medtravel`) |
| --- | --- |
| See progress, cost, what's next | `node loop/runner.mjs status` |
| Watch Claude work live | `node loop/runner.mjs watch` |
| Continue past a checkpoint | `node loop/runner.mjs approve C-01` |
| Retry a failed task after fixing something | `node loop/runner.mjs retry F-06` |
| Skip a task | `node loop/runner.mjs skip W-09` |
| Mark a task done that you did yourself | `node loop/runner.mjs done L-09` |
| Stop after the current task | `node loop/runner.mjs stop` (or `sudo systemctl stop medtravel-loop`) |
| Check the plan and run order | `node loop/runner.mjs plan` |

Commands work while the service is running; the runner picks them up within 30 seconds.

**Your part each day (about 30 minutes):**
- Read `docs/questions.md`: every assumption Claude made. Correct any wrong one by adding a note to CLAUDE.md or by `retry`-ing the task.
- Click through the new features on staging or locally on `develop`.
- When happy, merge `develop` into `main` yourself. The loop never touches `main`.

## Where it stops by default

| Stop | Why | Change in `config.json` |
| --- | --- | --- |
| Before C-01 | Review the foundation (auth, permissions, files, schema) once before 100 tasks build on it | `pauseBefore` |
| Before L-01 | The MVP is feature-complete: review it before hardening and launch work | `pauseBefore` |
| L-09 | Go-live checklist is human work (pen test, lawyer, live accounts) | `humanTasks` |
| Before M-01 | Phase 2 and 3 only run when you set `"includeLaterPhases": true` | `includeLaterPhases` |
| A task fails twice | Its work is saved on a `wip/<id>-…` branch, and you get a message with the reason | `maxAttempts`, `stopOnFailure` |
| Spend cap | `maxTotalUsd` (off by default; set it if you use an API key) | `maxTotalUsd` |

## Settings worth knowing (`loop/config.json`)

- `order`: the run order. It already respects dependencies, e.g. LG-01–04 before C-12, FI-02 before P-05, AD-04 before the website.
- `mergeMode`:
  - `"direct"` (default): merge into `develop` and push.
  - `"pr"`: open a pull request, wait for CI, then merge. Needs `GH_TOKEN`, and CI exists only after S-04.
  - `"local"`: never push.
- `claude.model` / `claude.effort`: leave `null` for defaults, or set e.g. `"opus"` and `"high"`.
- `claude.maxTaskUsd`: per-task spend cap passed to `--max-budget-usd` (useful with API keys).
- `claude.permissionMode`: `"bypassPermissions"` (default) lets Claude run any command without asking. That is only safe because the server is a dedicated VM, the runner uses a non-root user, and the deny list in `claude-settings.json` blocks pushes, commits, sudo, ssh and similar. For a more cautious mode, use `"auto"`, where a classifier reviews each action; some legitimate commands may then be refused.
- `review.blockingSeverities`: which review findings must be fixed before merge.
- `securityTasks`: tasks that also get the security reviewer.
- `rateLimitSleepMinutes`: how long to wait when Claude usage limits are hit.

## Files

| File | Purpose |
| --- | --- |
| `runner.mjs` | The loop (Node 22, no dependencies) |
| `config.json` | Order, checkpoints, limits, merge mode |
| `claude-settings.json` | Deny rules passed to every Claude run |
| `prompts/autonomous-rules.md` | Rules appended to Claude's system prompt: never wait, record assumptions, never touch git |
| `prompts/task.md`, `fix.md`, `review.md`, `security-review.md`, `review-fix.md` | Prompt templates |
| `setup-server.sh` | One-time server setup + systemd service |
| `.loop/` (created at run time, git-ignored) | `state.json`, logs per task, Claude's task summaries, review findings |

## Safety notes

- Code from an unattended loop still needs human eyes before real patients use it. Keep `main` human-merged, do the C-01 and L-01 reviews properly, and do the external penetration test in L-09.
- Never put production secrets on this server. Everything the loop builds runs against mocks and sandboxes.
- The deploy key only has access to this one repository. Revoke it when the build is done.
