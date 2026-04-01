# OpenAI / Codex Login Smoke Test

This repository supports OpenAI login through official Codex CLI.

The important distinction is:

- Forge can import Codex CLI login and create an `openai_session`
- whether Forge can run native OpenAI requests directly depends on what Codex
  made available locally

Current behavior:

- if Codex provides a usable OpenAI API credential, Forge can use the native
  OpenAI runtime directly
- if Codex only exposes a ChatGPT OAuth token without `api.responses.write`,
  Forge still logs in successfully and falls back to `codex exec` for simple
  no-tool text requests

## Recommended path

### 1. Log into Codex CLI

```bash
codex login
codex login status
```

Expected:

```text
Logged in using ChatGPT
```

### 2. Run the Forge preflight

```bash
node scripts/openai-oauth-preflight.mjs
```

Interpretation:

- `credentialKind=api_key` or equivalent: best case
- `oauth_access_token` with a warning about missing `api.responses.write`:
  login import works, but full native OpenAI coverage is not available

### 3. Import the login into Forge

```bash
bash scripts/run-forge-cli.sh auth login --openai
```

### 4. Verify session state

```bash
bash scripts/run-forge-cli.sh auth status
```

Expected shape:

- `loggedIn: true`
- `authMethod: "openai_session"`
- `authProvider: "openai"`
- `sessionIssuer: "openai"`
- `modelProvider: "openai"`

### 5. Run a minimal real request

```bash
bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1
```

Expected output:

```text
OK
```

## What this test actually proves

Passing the sequence above means:

- Codex CLI auth reuse works
- Forge can create and persist an `openai_session`
- Forge can complete at least one real no-tool request under that session

It does **not** prove:

- tool calling under native OpenAI is complete
- complex multi-turn bridge cases are complete
- all old Anthropic-first features work under OpenAI

## Optional browser OAuth path

Forge still contains a separate browser OAuth path, but it is no longer the
recommended default. Use it only if you explicitly want Forge to manage its own
OpenAI OAuth flow instead of reusing Codex CLI.

That path depends on `FORGE_OPENAI_CLIENT_ID` and related settings.

## Legacy broker / bootstrap checks

The old broker/bootstrap path is now optional for login validation.

You can still run the mock gateway if you are testing legacy bridge code:

```bash
node scripts/mock-forge-gateway.mjs
```

Endpoints:

- `GET /healthz`
- `POST /oauth/exchange`
- `GET /api/claude_cli/bootstrap`

But this is no longer required to prove that Codex-based OpenAI login works.

## Troubleshooting

### Login imports, but native requests fail

Run:

```bash
node scripts/openai-oauth-preflight.mjs
```

If it says the Codex credential is only an `oauth_access_token` without
Responses access, that is expected on some local setups. Forge should still be
able to handle simple no-tool text requests via `codex exec` fallback, but not
full native OpenAI coverage.

### `auth login --openai` works but `auth status` is not `openai_session`

Check that you are invoking the same config home and launcher both times. For
isolated testing, pin a temporary config dir:

```bash
FORGE_CONFIG_DIR="$(mktemp -d /tmp/forge-auth-test.XXXXXX)" \
  bash scripts/run-forge-cli.sh auth login --openai
```

Then reuse the same `FORGE_CONFIG_DIR` for `auth status` and `--print`.
