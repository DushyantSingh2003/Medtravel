---
name: security-check
description: Security and privacy review of uncommitted changes touching patient data, auth, files or money
disable-model-invocation: true
---
Use the security-reviewer subagent on all uncommitted changes. Fix every Critical and High finding, add a test that proves each fix, and re-run pnpm check. List any finding you did not fix and why.
