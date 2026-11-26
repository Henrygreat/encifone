#!/usr/bin/env bash
# Rejects modification or deletion of any Prisma migration file that
# already exists on the given base ref (default: origin/master) — the
# only CLI-native way Prisma offers to "fix" that is `prisma migrate
# reset`, which wipes the database. See CLAUDE.md rule 13 and
# docs/DECISION_LOG.md for the incident this guards against.
#
# Usage: scripts/check-migration-integrity.sh [base-ref]
# Non-destructive: read-only (git show/diff), exits non-zero on violation.
set -euo pipefail

BASE_REF="${1:-origin/master}"
MIGRATIONS_DIR="prisma/migrations"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "WARNING: base ref '$BASE_REF' not found locally — fetching..."
  git fetch origin "${BASE_REF#origin/}" --depth=1 2>/dev/null || true
fi

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "SKIP: base ref '$BASE_REF' still not available (likely running outside its normal CI context). Nothing checked."
  exit 0
fi

violations=0

base_files=$(git ls-tree -r "$BASE_REF" --name-only -- "$MIGRATIONS_DIR" 2>/dev/null | grep 'migration\.sql$' || true)

if [ -z "$base_files" ]; then
  echo "No migration files found on $BASE_REF yet — nothing to protect."
  exit 0
fi

while IFS= read -r file; do
  [ -z "$file" ] && continue

  if ! git cat-file -e "HEAD:$file" 2>/dev/null; then
    echo "::error::Migration file deleted: $file (existed on $BASE_REF, missing on HEAD)"
    violations=$((violations + 1))
    continue
  fi

  base_content=$(git show "$BASE_REF:$file")
  head_content=$(git show "HEAD:$file")

  if [ "$base_content" != "$head_content" ]; then
    echo "::error::Previously applied migration modified: $file (differs from $BASE_REF)"
    echo "  This file must never change after being applied — add a NEW migration instead."
    violations=$((violations + 1))
  fi
done <<< "$base_files"

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "FAILED: $violations migration integrity violation(s). See CLAUDE.md rule 13."
  exit 1
fi

echo "OK: all $(echo "$base_files" | wc -l) migration file(s) on $BASE_REF are unchanged on HEAD."
