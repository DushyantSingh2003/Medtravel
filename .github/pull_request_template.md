## Task

<!-- Task ID from docs/BUILD_PLAN.md, e.g. C-03. For work outside the plan, say so. -->

**Task ID:**

## What changed and why

<!-- Two or three sentences. Link the PRD section if relevant. -->

## Checklist

- [ ] `pnpm check` is green locally
- [ ] Tests added or updated (unit; API e2e including a forbidden-role test for new endpoints; Playwright for new user-facing flows)
- [ ] I ran the app and used the change, not only the tests
- [ ] `docs/progress.md` updated (task ticked, deferred work listed)
- [ ] New environment variables are in `.env.example` and validated in the config schema
- [ ] No PII, medical data or secrets in logs, fixtures or screenshots
- [ ] No test was skipped, deleted or weakened to get green

## Screenshots

<!-- For any UI change: before/after, both English and Arabic (RTL), and a 360 px wide view. Remove if not applicable. -->

## Migration?

- [ ] No database migration
- [ ] Includes a migration — it is a **new** file (never edit a committed migration), and I checked it against a copy of realistic data

<!-- If there is a migration, note anything that locks a large table, backfills data, or needs a deploy order. -->

## Notes for the reviewer

<!-- Risks, trade-offs, follow-ups, anything unusual. -->
