TASK {{TASK_ID}} — {{TASK_TITLE}}

## Task instructions (from docs/BUILD_PLAN.md)

{{TASK_TEXT}}

## Acceptance check

{{DONE_WHEN}}

Verify this yourself before finishing (with a test, a script or the Playwright MCP if configured).

## Procedure

1. Read CLAUDE.md if it exists, the PRD sections this task refers to in docs/PRD.md, docs/progress.md, docs/questions.md, and the most similar existing module. Follow existing patterns exactly.
2. Write your plan to docs/plans/{{TASK_ID}}.md: data model changes, API endpoints with method, path and permission, events and notifications, UI screens and shared components, i18n keys, tests, and assumptions.
3. Implement the task following CLAUDE.md. Extend seed data so the feature can be tried immediately.
4. Write the tests CLAUDE.md requires (unit, API e2e including a forbidden-role test, Playwright for new user-facing flows).
5. Run `pnpm install` and `pnpm check` and fix until green.
6. Update docs/progress.md, and docs/api.md if endpoints changed.
7. Write .loop/out/{{TASK_ID}}.json as described in the autonomous rules.
