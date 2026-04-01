# Forge Usage Guide

This guide describes how to use the repository in its current real state.

## Start Forge

### Install from npm

```bash
npm install -g forge-research-snapshot
```

Then use:

```bash
forge --version
forge --help
forge auth status
```

The npm package installs the `forge` launcher and bundles Bun through the
official `bun` npm package. You should not need a separate Bun install. If you
want to force a different runtime, set `BUN_BIN=/path/to/bun`.

Preferred launcher:

```bash
bash scripts/run-forge-cli.sh
```

Useful checks:

```bash
bash scripts/run-forge-cli.sh --version
bash scripts/run-forge-cli.sh --help
bash scripts/run-forge-cli.sh auth status
```

Package-script equivalents:

```bash
bun run cli
bun run version
```

## Authentication

### Preferred: import official Codex CLI login

1. Log into Codex:

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

Expected state:

- `loggedIn: true`
- `authMethod: "openai_session"`
- `authProvider: "openai"`

### Existing first-party login

If your local config already contains the older first-party login state, Forge
still reads it through compatibility paths.

## REPL

Start an interactive session:

```bash
bash scripts/run-forge-cli.sh
```

You can also pass an initial prompt:

```bash
bash scripts/run-forge-cli.sh "Summarize this repository."
```

## Non-interactive mode

Basic `--print` request:

```bash
bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1
```

Current practical use:

- quick scripted prompts
- smoke tests
- simple no-tool text requests

## OpenAI / Codex behavior today

Forge now supports OpenAI login through Codex CLI, but there are two runtime
cases:

1. Codex provides a usable OpenAI credential for Responses API.
   Forge can use the native OpenAI path directly.

2. Codex only exposes a ChatGPT OAuth token without `api.responses.write`.
   Forge still logs in successfully and falls back to `codex exec` for simple
   no-tool text requests.

This means:

- login import works
- minimal text requests work
- full OpenAI feature parity is not finished yet

## Common commands

```bash
bash scripts/run-forge-cli.sh --help
bash scripts/run-forge-cli.sh auth status
bash scripts/run-forge-cli.sh auth login --openai
bash scripts/run-forge-cli.sh doctor
bash scripts/run-forge-cli.sh update
```

Inside the interactive CLI, the command set is broader, including auth,
plugins, MCP, doctor, status, memory, and model-related commands.

## Useful project scripts

```bash
bun run generate
node scripts/recovery-audit.mjs
node scripts/openai-oauth-preflight.mjs
node scripts/mock-forge-gateway.mjs
```

What they do:

- `generate`: regenerates derived SDK/settings files
- `recovery-audit`: checks recovery regressions
- `openai-oauth-preflight`: checks Codex/OpenAI login readiness
- `mock-forge-gateway`: optional legacy bridge test server

## Troubleshooting

### `auth login --openai` works, but requests fail

Run:

```bash
node scripts/openai-oauth-preflight.mjs
```

If it reports an `oauth_access_token` without Responses access, Forge can still
import the login, but only the simple fallback path is available.

### `auth status` looks wrong after testing

Use an isolated config dir:

```bash
FORGE_CONFIG_DIR="$(mktemp -d /tmp/forge-auth-test.XXXXXX)" \
  bash scripts/run-forge-cli.sh auth login --openai
```

Then reuse the same `FORGE_CONFIG_DIR` for later commands.

### CLI starts but behavior seems inconsistent

Re-run the core checks:

```bash
bun run generate
node scripts/recovery-audit.mjs
bash scripts/run-forge-cli.sh --help
bash scripts/run-forge-cli.sh auth status
```

## Current limitations

- OpenAI tool-calling coverage is not complete
- not every historical Anthropic-first subsystem is fully adapted
- some advanced paths still rely on compatibility behavior rather than a fully
  clean Forge-native implementation
