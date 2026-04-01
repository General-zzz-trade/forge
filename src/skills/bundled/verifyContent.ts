export const SKILL_MD = `---
description: Verify a code change does what it should by running the app.
---

Use this skill to verify a change locally.

## Goals

- Prove the modified path still works
- Prefer the smallest credible verification loop
- Capture exactly what was run and what happened

## Verification strategy

1. Start with the narrowest command that exercises the change directly.
2. If the change affects multiple layers, move outward one layer at a time.
3. Prefer deterministic checks over manual spot checks when available.
4. If a command fails because of environment issues, separate product bugs from local setup problems.

## What good verification looks like

- One or more commands tied to the changed surface
- Clear pass/fail signal
- Explicit note of any gaps that were not exercised

## Report format

- What was verified
- Commands run
- Result
- Any remaining risk
`

export const SKILL_FILES: Record<string, string> = {
  'examples/cli.md': `# CLI verification

Use a direct command invocation with the minimum flags needed to exercise the change.

Example pattern:

\`\`\`bash
forge --help
forge auth status
\`\`\`

Prefer exact command output checks when the feature is command-line facing.
`,
  'examples/server.md': `# Server verification

For request/response paths:

1. Start the server with the local configuration for the changed surface.
2. Exercise the exact route or interaction you modified.
3. Confirm status code, key response fields, and any side effects.

If full end-to-end setup is unavailable, run the narrowest local harness that still proves behavior.
`,
}
