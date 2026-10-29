# ADR 005 — One permission matrix, one scoping service

Status: accepted (F-04)

## Decision

- The matrix (role × subject → actions, scope, field groups) is data in `packages/contracts`. CASL (`@casl/ability`) is the
  engine behind `can(role, action, subject, field?)`, so the API guard and the portal's `useCan` answer identically.
- Which rows a role sees is not in the matrix engine but in `apps/api/src/rbac/scope.service.ts`, which turns the scope
  names into Prisma filters (`caseWhere`, `documentWhere`, `patientWhere`). Modules AND the filter into their queries;
  nothing else in the API looks at a role to decide what data to return.
- A role with no access gets a filter that matches nothing, never one that matches everything. A case outside the scope is
  answered 404, not 403, so its existence is not revealed.
- Magic-link sessions are narrowed to their single case (sent to their hospital) inside `caseWhere`, whatever the role says.
- `docs/permissions.md` is generated from the matrix; a unit test fails while it is stale.

## Why not CASL conditions or `@casl/prisma`

Conditions would duplicate the scoping rules in a second language and make the filter harder to read and index. The matrix
stays declarative and the filters are plain Prisma, tested against a real database for every role.

## Consequences

A new subject means a matrix row, a table-driven test line (the test lists every role against every subject) and, if it is
scoped through a case, nothing else. A new scope means a case in `ScopeService.byRole`.
