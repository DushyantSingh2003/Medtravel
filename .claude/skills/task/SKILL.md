---
name: task
description: Implement one build-plan task end to end with plan, tests and checks
disable-model-invocation: true
argument-hint: <TASK-ID> <task details>
---
Implement this build task: $ARGUMENTS

1. Re-read the rules in CLAUDE.md. Find the task ID in docs/BUILD_PLAN.md and read the PRD sections it names in docs/PRD.md. Read docs/progress.md to see what exists. Open the most similar existing module and follow its pattern.
2. Write a plan: data model changes, API endpoints (method, path, permission), events and notifications, UI screens and components, i18n keys, tests. List PRD ambiguities as questions. STOP and wait for my approval.
3. After approval, implement in small steps. Migrations via pnpm db:migrate --name <task-id>-<slug>. Run pnpm api:generate after API changes. Extend seed data so the feature can be tried immediately.
4. Write the tests required by CLAUDE.md.
5. Run pnpm check and fix until green.
6. Update docs/progress.md (tick task, list anything deferred) and docs/api.md if endpoints changed.
7. Summarise what changed and give me exact steps to try it (URL, seed user). Suggest a commit message. Do not commit until I say so.
