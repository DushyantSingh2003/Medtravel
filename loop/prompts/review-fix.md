An independent {{KIND}} reviewer checked your changes for task {{TASK_ID}} and found these problems:

{{FINDINGS}}

Fix every one of them properly, adding a test that proves each fix where possible. If you are certain a finding is wrong, explain why in docs/plans/{{TASK_ID}}.md under "Review notes" instead of changing code. Then run `pnpm check` until it passes and update .loop/out/{{TASK_ID}}.json.
