# Forge

Forge is a locally recovered and reworked CLI fork built from a public source
snapshot of Anthropic's Claude Code. This repository is not an official
Anthropic project. In its current state, it is a runnable terminal coding
assistant with a working CLI, REPL startup, non-interactive `--print` mode, and
two authentication paths:

- existing first-party `claude.ai` style login, if present in local config
- GPT/OpenAI login imported from official Codex CLI

The repository has moved beyond "snapshot analysis only". The main product path
now boots and can execute real requests.

## Current status

Verified locally:

- `bash scripts/run-forge-cli.sh --version`
- `bash scripts/run-forge-cli.sh --help`
- `bash scripts/run-forge-cli.sh auth status`
- `bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1`
- `bash scripts/run-forge-cli.sh auth login --openai` using Codex CLI login reuse

The recovery audit also passes:

```bash
node scripts/recovery-audit.mjs
```

What is solid now:

- self-contained npm launcher with Bun bundled as a dependency
- generated SDK/settings artifacts
- local launcher script
- basic interactive startup
- non-interactive request path
- Codex CLI based OpenAI login import

What is still partial:

- the native OpenAI path is not feature-complete for all tool/multi-turn cases
- if Codex only exposes a ChatGPT OAuth token without `api.responses.write`,
  Forge falls back to `codex exec` for simple no-tool text requests
- some historical Anthropic-specific integrations remain in compatibility
  boundaries

## Quick start

### npm install

Published package name:

```bash
npm install -g forge-research-snapshot
```

Then run:

```bash
forge --version
forge --help
```

The npm package now installs Bun automatically through the official `bun` npm
package. You should not need to install Bun separately. If you want to override
the runtime, set `BUN_BIN=/path/to/bun`.

### 1. Install dependencies

```bash
bun install
```

### 2. Generate derived files

```bash
bun run generate
```

### 3. Start Forge

Canonical launcher:

```bash
bash scripts/run-forge-cli.sh
```

Useful checks:

```bash
bash scripts/run-forge-cli.sh --version
bash scripts/run-forge-cli.sh --help
bash scripts/run-forge-cli.sh auth status
```

Non-interactive smoke test:

```bash
bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1
```

You can also use package scripts:

```bash
bun run cli
bun run version
bun run recovery:audit
bun run preflight:openai
```

## Authentication

### OpenAI / GPT via Codex CLI

This is the preferred OpenAI path.

1. Sign in with official Codex CLI:

```bash
codex login
codex login status
```

2. Import that login into Forge:

```bash
bash scripts/run-forge-cli.sh auth login --openai
```

3. Verify:

```bash
bash scripts/run-forge-cli.sh auth status
```

If the imported Codex credential includes a usable API key or Responses scope,
Forge can use the native OpenAI runtime directly. If not, Forge still imports
the login and can run simple no-tool text requests through a `codex exec`
fallback.

Detailed validation steps are in
[docs/openai-oauth-smoke-test.md](/home/ubuntu/claude-code/docs/openai-oauth-smoke-test.md).

### Existing first-party login

If your local config already contains the legacy first-party login state, Forge
will continue to read it through the compatibility layer. This repository still
contains that path for local continuity, but it is no longer the only way to
start the product.

## Architecture summary

This codebase is still a large modular CLI monolith. The important top-level
areas are:

- [`src/entrypoints/cli.tsx`](/home/ubuntu/claude-code/src/entrypoints/cli.tsx): CLI entrypoint
- [`src/main.tsx`](/home/ubuntu/claude-code/src/main.tsx): startup orchestration and mode routing
- [`src/cli/print.ts`](/home/ubuntu/claude-code/src/cli/print.ts): non-interactive/headless execution
- [`src/QueryEngine.ts`](/home/ubuntu/claude-code/src/QueryEngine.ts): query loop
- [`src/services/api/claude.ts`](/home/ubuntu/claude-code/src/services/api/claude.ts): model dispatch
- [`src/services/api/openai.ts`](/home/ubuntu/claude-code/src/services/api/openai.ts): native OpenAI path plus Codex fallback
- [`src/tools.ts`](/home/ubuntu/claude-code/src/tools.ts): built-in tool registry
- [`src/commands.ts`](/home/ubuntu/claude-code/src/commands.ts): command registry

High-level subsystem layout:

- `src/commands/`: slash/CLI commands
- `src/tools/`: tool implementations
- `src/components/` and `src/screens/`: Ink UI
- `src/services/`: API, auth, MCP, analytics, sync, compact
- `src/utils/`: pathing, config, permissions, session storage, adapters
- `src/bridge/`: IDE/remote bridge
- `src/skills/` and `src/plugins/`: extensibility

## Documentation map

- [Usage guide](/home/ubuntu/claude-code/docs/usage.md)
- [OpenAI OAuth smoke test](/home/ubuntu/claude-code/docs/openai-oauth-smoke-test.md)
- [Recovery and evolution roadmap](/home/ubuntu/claude-code/docs/recovery-roadmap.md)
- [Forge design note](/home/ubuntu/claude-code/docs/superpowers/specs/2026-04-01-forge-design.md)

## Reality-based limitations

- This repository was reconstructed from a public source snapshot and then
  heavily adapted locally.
- Some module names, compatibility layers, and internal abstractions still
  reflect Claude/Anthropic heritage.
- OpenAI support is now real, but not all advanced paths are native OpenAI yet.
- A few features are best understood as "publicly runnable recovery build"
  rather than polished release product.

## Recommended next work

1. Expand OpenAI runtime coverage beyond simple no-tool requests.
2. Reduce remaining Anthropic-specific compatibility naming in public surfaces.
3. Tighten build metadata injection so `run-forge-cli.sh` is no longer the only
   supported launcher.
4. Add repeatable regression checks for REPL, `--print`, auth, and tool basics.
