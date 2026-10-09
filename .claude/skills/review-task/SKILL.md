---
name: review-task
description: Independent review of uncommitted changes before commit
disable-model-invocation: true
---
Use the code-reviewer subagent to review all uncommitted changes (git diff plus untracked files) against CLAUDE.md and the PRD sections for the current task. Then show its findings grouped High / Medium / Low, fix every High and Medium finding, and re-run pnpm check.
