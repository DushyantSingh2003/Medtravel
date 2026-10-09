#!/usr/bin/env bash
# PreToolUse hook for Edit|Write: refuse edits to secrets and Git internals.
#
# Claude Code passes the tool call as JSON on stdin. Exit code 2 blocks the call and shows
# stderr to the model; exit 0 lets it through.
#
# Blocked:   .env and .env.<anything>  (real secrets)
#            anything under .git/
#            pnpm-lock.yaml            (regenerate with pnpm, never by hand)
# Allowed:   .env.example              (new variables must be documented there)

set -euo pipefail

file_path="$(jq -r '.tool_input.file_path // empty')"

# Nothing to check (not a file tool call).
[ -z "$file_path" ] && exit 0

base="$(basename "$file_path")"

block() {
  echo "Blocked: $file_path is protected ($1). Do not edit it directly." >&2
  exit 2
}

case "$base" in
  .env.example) ;;
  .env | .env.*) block "secrets file; add new variables to .env.example instead" ;;
  pnpm-lock.yaml) block "lockfile; run pnpm install to update it" ;;
esac

case "/$file_path" in
  */.git/*) block "Git internals" ;;
esac

exit 0
