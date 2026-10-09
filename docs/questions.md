# Open questions and assumptions

Appended by build tasks. Format: `- [<TASK-ID>] <question> — assumed: <what was chosen>`

- [S-01] The plan assumes older majors of Next, Nest, Tailwind, Zod and Prisma than the registry now serves — assumed: used the current stable majors (Next 16, Nest 12, Tailwind 4, Zod 4, Prisma 7), following what the official generators emit.
- [S-01] Nest 12's generator emits oxlint while Next's emits ESLint — assumed: one shared ESLint 9 flat config in `packages/config` for every workspace, because the plan asks for a single shared preset and `eslint-config-next` needs ESLint. ESLint 10 is the registry latest but `eslint-config-next` 16 targets 9.
- [S-01] Prisma's `latest` tag is a release candidate (8.0.0-rc) — assumed: pinned stable 7.10; revisit when 8 is released.
- [S-01] `nestjs-zod` 5.5 declares peer ranges that exclude Nest 12 — assumed: safe to use, since it imports and works (validated by the API e2e test); the peer range is stale. Re-check when it publishes a Nest 12 range.
- [S-01] Tailwind 4 has no JS config, so the plan's "Tailwind preset" — assumed: a shared `theme.css` with an `@theme` block in `packages/ui`.
- [S-01] BullMQ on native ESM cannot lazy-load ioredis from connection options — assumed: the worker passes a constructed `ioredis` client.
