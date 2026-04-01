#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_BIN="${BUN_BIN:-$HOME/.bun/bin/bun}"
VERSION="${FORGE_VERSION:-$(node -p "require('$ROOT_DIR/package.json').version")}"
BUILD_TIME="${FORGE_BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

exec "$BUN_BIN" run \
  --cwd "$ROOT_DIR" \
  --install=fallback \
  --define "MACRO={\"VERSION\":\"$VERSION\",\"BUILD_TIME\":\"$BUILD_TIME\",\"VERSION_CHANGELOG\":\"\"}" \
  src/entrypoints/cli.tsx \
  "$@"
