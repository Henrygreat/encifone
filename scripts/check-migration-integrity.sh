#!/usr/bin/env bash
# Rejects modification or deletion of any Prisma migration file whose
# checksum is recorded in prisma/migrations/checksums.json — the single
# source of truth, sourced from a real database's _prisma_migrations table,
# NOT from comparing against another git branch.
#
# Why not just diff against origin/master (the original approach)? Because
# a branch can itself carry a corrupted migration file — exactly what
# happened here: master/develop's copy of 20261125124136_enable_pgvector
# was accidentally altered by an unrelated repo-wide rename sweep, and nothing
# caught it because nothing had ever checked it against the database that
# actually applied it. See docs/DECISION_LOG.md. A manifest decoupled from
# any branch's history is the fix.
#
# Usage:
#   scripts/check-migration-integrity.sh              # check mode (default, CI)
#   scripts/check-migration-integrity.sh --record      # record mode: with
#     DATABASE_URL pointed at a database that has just applied every
#     migration present locally, (re)writes checksums.json from its
#     _prisma_migrations table. Run this once right after creating and
#     applying a new migration, then commit the updated checksums.json.
#     Never hand-edit the file.
#
# Non-destructive either way: --record only reads the database and writes
# the local checksums.json file; it never touches _prisma_migrations itself.
set -euo pipefail

cd "$(dirname "$0")/.."
MIGRATIONS_DIR="prisma/migrations"
MANIFEST="$MIGRATIONS_DIR/checksums.json"
MODE="${1:-check}"

if [ "$MODE" = "--record" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "::error::--record requires DATABASE_URL to be set, pointed at a database that has just run 'prisma migrate deploy' for every migration you want recorded."
    exit 1
  fi
  echo "Recording checksums from the database's _prisma_migrations table..."
  node -e "
    const { Client } = require('pg');
    (async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      const { rows } = await client.query('SELECT migration_name, checksum FROM _prisma_migrations ORDER BY started_at');
      await client.end();
      const fs = require('fs');
      const manifest = { _comment: 'Authoritative record of each migration\'s verified checksum, sourced from a real database\'s _prisma_migrations table — see scripts/check-migration-integrity.sh header. Never hand-edit.' };
      for (const r of rows) manifest[r.migration_name] = r.checksum;
      fs.writeFileSync('$MANIFEST', JSON.stringify(manifest, null, 2) + '\n');
      console.log('Wrote', rows.length, 'checksum(s) to $MANIFEST');
    })().catch((e) => { console.error(e.message); process.exit(1); });
  "
  exit 0
fi

if [ ! -f "$MANIFEST" ]; then
  echo "No $MANIFEST found — nothing to check against yet. Run with --record once a migration has been applied."
  exit 0
fi

violations=0
checked=0

for dir in "$MIGRATIONS_DIR"/*/; do
  name=$(basename "$dir")
  file="$dir/migration.sql"
  [ -f "$file" ] || continue

  expected=$(node -e "const m = require('./$MANIFEST'); process.stdout.write(m['$name'] || '')")
  if [ -z "$expected" ]; then
    echo "NEW (not yet in manifest, nothing to verify): $name"
    continue
  fi

  actual=$(sha256sum "$file" | cut -d' ' -f1)
  checked=$((checked + 1))
  if [ "$actual" != "$expected" ]; then
    echo "::error::Migration file changed since it was applied: $name"
    echo "  Recorded (applied) checksum: $expected"
    echo "  Current file checksum:       $actual"
    echo "  This file must never change after being applied — add a NEW migration instead. See CLAUDE.md rule 13."
    violations=$((violations + 1))
  fi
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "FAILED: $violations migration integrity violation(s) out of $checked checked."
  exit 1
fi

echo "OK: all $checked manifested migration(s) match their recorded applied checksum."
