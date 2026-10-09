---
name: scaffold-module
description: Scaffold a full CRUD vertical slice for one entity following the reference module
disable-model-invocation: true
argument-hint: <EntityName> <portal route> <fields and permissions>
---
Create a vertical slice for: $ARGUMENTS
Follow apps/api/src/modules/masters exactly as the reference pattern.
1. Zod schemas + types in packages/contracts. 2. Prisma model + migration (if missing). 3. NestJS module: controller, service, permissions, list with cursor pagination + filters + search, get, create, update, soft delete, audit events. 4. API e2e tests incl. forbidden role. 5. pnpm api:generate. 6. Portal list page (DataTable with filters, search, column sort), detail/edit page, create dialog, using packages/ui. 7. en + ar i18n keys. 8. Seed 5 realistic records. 9. pnpm check.
Show the plan first and wait for approval.
