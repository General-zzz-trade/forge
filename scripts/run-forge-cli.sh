#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_BIN="${BUN_BIN:-$ROOT_DIR/node_modules/.bin/bun}"
if [[ ! -x "$BUN_BIN" ]]; then
  BUN_BIN="${HOME}/.bun/bin/bun"
fi
VERSION="${FORGE_VERSION:-$(node -p "require('$ROOT_DIR/package.json').version")}"
BUILD_TIME="${FORGE_BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

EXTRA_ENV=()
HAS_HEADLESS_FLAG=0
for arg in "$@"; do
  case "$arg" in
    -p|--print|--init-only|--sdk-url*)
      HAS_HEADLESS_FLAG=1
      ;;
  esac
done

if [[ $HAS_HEADLESS_FLAG -eq 0 ]]; then
  if [[ -t 0 && ( -t 1 || -t 2 ) ]]; then
    EXTRA_ENV+=(FORCE_INTERACTIVE=1)
  else
    echo "Forge interactive startup requires a TTY. Run \`npm start\` in a terminal, or use \`forge --print ...\` for non-interactive mode." >&2
    exit 1
  fi
fi

exec env "${EXTRA_ENV[@]}" "$BUN_BIN" run \
  --cwd "$ROOT_DIR" \
  --define "MACRO={\"VERSION\":\"$VERSION\",\"BUILD_TIME\":\"$BUILD_TIME\",\"VERSION_CHANGELOG\":\"\"}" \
  src/entrypoints/cli.tsx \
  "$@"
