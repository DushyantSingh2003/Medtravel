# ADR 011 — The case state machine is pure code in contracts; one service changes the stage

Status: accepted (F-10)

## Decision

- Which moves are allowed, what each needs, who may make it, and the status that follows are pure functions in
  `packages/contracts/src/case-machine.ts` (`describeTransition`, `missingRequirements`, `canMoveCase`). The API, the worker and the
  screens read the same rules; the test matrix runs every state against every target.
- `CaseStageService.transition()` is the only code that writes `Case.stage`. In one transaction it locks the case row, checks the
  machine, the actor and the data the move needs, updates the case and its stage timer, writes the stage history, creates the stage's
  automatic tasks, audits, and queues `case.stage_changed` and a realtime push through the outbox.
- Defaults (owner role, target minutes, automatic tasks) live in code; the `StageConfig` table holds only what an admin changed.
- The stage timer is a due date on the case (`slaDueAt`) set by the move itself, not a job per case. A per-minute worker sweep marks
  and announces overdue cases once (`slaBreachedAt`); moving the case clears the mark and starts a new timer.
- `closed` is a status on a case that stays in `follow_up`; `lost`, `on_hold` and `cancelled` are stages (they are in the database enum).
- A case outside the caller's scope is a 404, as everywhere else; a move the machine forbids is 409, a missing role 403, missing data 422
  with the field named.

## Why not

A job per case timer needs cancelling on every move and loses timers when Redis restarts. Letting each module update `stage` would
spread the rules and skip the history, tasks and events.

## Consequences

Later tasks add their own requirements to `ENTRY_REQUIREMENTS` and their own facts to `CaseStageService.factsFor`, with a test each.
