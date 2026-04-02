#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BUN_BIN:-}" ]]; then
  exec "${BUN_BIN}" "$@"
fi

if command -v bun >/dev/null 2>&1; then
  exec "$(command -v bun)" "$@"
fi

if [[ -n "${HOME:-}" && -x "${HOME}/.bun/bin/bun" ]]; then
  exec "${HOME}/.bun/bin/bun" "$@"
fi

echo "Forge requires Bun, but no Bun binary was found. Install Bun or set BUN_BIN." >&2
exit 127
