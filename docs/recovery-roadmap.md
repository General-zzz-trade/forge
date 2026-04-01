# Forge Recovery Roadmap

This repository is no longer in the "bare snapshot that kind of boots" phase.
The main recovery work is already done:

- the CLI starts
- generated artifacts exist
- recovery audit passes
- basic authentication flows work
- the main non-interactive request path works

The roadmap now shifts from recovery to hardening and cleanup.

## Current verified baseline

Verified locally:

- `bun run generate`
- `node scripts/recovery-audit.mjs`
- `bash scripts/run-forge-cli.sh --version`
- `bash scripts/run-forge-cli.sh --help`
- `bash scripts/run-forge-cli.sh auth status`
- `bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1`

Additionally verified:

- `auth login --openai` can import official Codex CLI login
- `openai_session` can service a minimal no-tool request

## What has been recovered

### Build and generation

- package manifest and Bun entry scripts
- SDK generated bridge files
- generated settings schema
- local launcher flow via `scripts/run-forge-cli.sh`

### Runtime

- CLI startup
- command registration
- headless `--print`
- REPL startup
- ripgrep fallback
- main request path

### Auth

- legacy local auth compatibility
- OpenAI login through Codex CLI import
- optional browser OAuth path

### Recovery debt already cleared

The recovery audit confirms these earlier blockers are no longer active:

- no local `@ant/claude-for-chrome-mcp` stub
- no local `color-diff-napi` stub
- no local Tungsten stub file
- bundled skill placeholders have been replaced

## Remaining work

### 1. OpenAI runtime coverage

The current OpenAI path is usable, but not complete.

Still worth improving:

- tool-calling under OpenAI
- richer multi-turn bridging
- structured outputs
- fewer Claude-specific assumptions in model/runtime layers

### 2. Build formalization

The local launcher still injects `MACRO` values at runtime. That is acceptable
for local development, but not the cleanest final distribution path.

Target:

- formal build-time version/build metadata
- fewer launcher-specific assumptions

### 3. Naming cleanup

The public surface is mostly Forge, but compatibility layers still carry older
Claude/Anthropic naming in places where hard breaks would be risky.

Target:

- continue reducing legacy names in non-compatibility code paths
- keep only deliberate compatibility boundaries

### 4. Regression coverage

The project needs a repeatable "known good" verification set.

Minimum useful regression suite:

- startup
- `--help`
- `auth status`
- `auth login --openai`
- one real `--print` request
- basic tool smoke tests

## Suggested next milestones

1. Stabilize OpenAI tool and multi-turn behavior.
2. Add repeatable end-to-end smoke scripts.
3. Formalize build metadata instead of relying primarily on the launcher.
4. Continue shrinking legacy compatibility naming in active code paths.

## Audit command

Run:

```bash
node scripts/recovery-audit.mjs
```

This is the fastest current check for whether the repository has regressed back
into "snapshot boot hacks" territory.
