# Cloud build loop: procedure for one routine run

You are running as a scheduled Claude Code routine in a fresh cloud session. Do **exactly one** build task from `docs/BUILD_PLAN.md`, then stop. Nobody is watching and nobody can answer questions. Follow these steps in order.

## Rules for this run

- Apply every rule in `loop/prompts/autonomous-rules.md`, **except rule 4**: in cloud mode you own git, and you use only the git commands written in this file.
- You may push to `develop`, `task/*` and `wip/*` branches of this repository. **Never push to `main`.** Never force-push, never rewrite history, never delete branches.
- Never commit `.env` files (only `.env.example`) and never commit the `.loop/` folder. If `.gitignore` lacks `.loop/` or `.env`, add them.
- If you create or edit `.claude/settings.json`, keep the key `"effortLevel": "high"` in it.
- Commands that can take longer than 2 minutes (`pnpm install`, `pnpm check`, builds, Playwright) must run with a timeout of 10 minutes or more, or in the background with polling.

## 1. Get onto `develop`

```bash
git fetch origin
git rev-parse --verify -q origin/develop && git checkout -B develop origin/develop \
  || { git checkout -B develop origin/main && git push -u origin develop; }
```

## 2. Pick the task

```bash
node loop/cloud.mjs next
```

- If the output starts with `DONE`, `BUSY`, `STOPPED`, `HUMAN` or `CHECKPOINT`:
  1. If `loop/` changed, run `git add loop && git commit -m "loop: apply queued commands" && git push origin develop`.
  2. End the run with a two-line summary quoting that output.
  3. Do nothing else.
- If it printed `Applied queued commands`, those `loop/` changes are committed together with the claim in step 3.
- If it prints `TASK: <ID>`, note the ID, title, attempt number and `SECURITY_REVIEW` flag. Everything under `----- TASK PROMPT -----` is your assignment.

## 3. Claim the task

```bash
node loop/cloud.mjs claim <ID>
git add loop && git commit -m "loop: claim <ID>" && git push origin develop
```

If the push is rejected:
1. Run `git pull --rebase origin develop`.
2. Run `node loop/cloud.mjs next` again.
3. If it no longer shows the same `TASK`, another run took it: end the run.
4. If it still shows the same task, claim again.

## 4. Prepare the environment

```bash
git checkout -b task/<id-in-lowercase>
[ -f infra/docker-compose.yml ] && docker compose -f infra/docker-compose.yml up -d --wait
[ -f package.json ] && pnpm install
```

If the project needs PostgreSQL or Redis but has no docker-compose file yet, start the preinstalled ones with `service postgresql start` and `service redis-server start`.

## 5. Do the task

Carry out the task prompt completely, following `CLAUDE.md` (once it exists) and the autonomous rules. That means:

- write the plan to `docs/plans/<ID>.md`
- record assumptions in `docs/questions.md`
- build the feature with tests and seed data
- update `docs/progress.md`
- write the summary JSON to `.loop/out/<ID>.json`

## 6. Verify

Run `pnpm install` and `pnpm check` (each with a long timeout). They must pass. Fix root causes; never weaken, skip or delete tests. After 4 unsuccessful fix rounds, go to step 9.

## 7. Independent review

1. Start a fresh subagent with the Agent tool:
   - use the `code-reviewer` agent if `.claude/agents/code-reviewer.md` exists, otherwise a general-purpose subagent;
   - give it the text of `loop/prompts/review.md` with `{{TASK_ID}}`, `{{TASK_TITLE}}`, `{{TASK_TEXT}}` and `{{DONE_WHEN}}` filled in;
   - tell it not to edit any files.
2. Fix every critical, high and medium finding, then repeat step 6.
3. If `SECURITY_REVIEW: yes`, do the same with `loop/prompts/security-review.md` (use the `security-reviewer` agent if it exists) and fix every critical and high finding.
4. Note the findings and what you changed under a "Review" heading in `docs/plans/<ID>.md`.

## 8. Success: commit, merge, push

```bash
git add -A
git commit -m "<ID>: <title>" -m "<summary from .loop/out/<ID>.json>" -m "Assumptions: <list>"
git checkout develop
git pull --ff-only origin develop
git merge --no-ff task/<id-in-lowercase> -m "Merge <ID>: <title>"
node loop/cloud.mjs finish <ID> done "<one-line summary>"
git add loop/cloud-state.json && git commit -m "loop: <ID> done"
git push origin develop
git push origin task/<id-in-lowercase>
```

If the push of `develop` is rejected, run `git pull --rebase origin develop` and push again. If `loop/cloud-state.json` conflicts, keep both sides' task entries.

## 9. Failure

If checks still fail after 4 fix rounds, or the task cannot be done in this environment:

```bash
git add -A && git commit -m "WIP <ID>: <short reason>"
git push origin task/<id-in-lowercase>:wip/<id-in-lowercase>-attempt-<n>
git checkout develop && git pull --ff-only origin develop
node loop/cloud.mjs finish <ID> failed "<1-3 sentence reason> Work saved on wip/<id>-attempt-<n>."
git add loop/cloud-state.json && git commit -m "loop: <ID> failed" && git push origin develop
```

Use `blocked` instead of `failed` when the task needs a human (an account, a decision, credentials). A failed task is retried automatically by the next run until it reaches the attempt limit; after that the loop stops until a human queues a `retry`.

## 10. End the run

Finish with a short report:
- task ID and result
- 3–5 lines on what was built
- the questions you added to `docs/questions.md`
- anything a human should check
