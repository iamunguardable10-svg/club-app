#!/usr/bin/env bash
# Recreates a local test database and runs the shim, all migrations and the
# access-rule tests. Needs a plain local Postgres (15+); never point this at
# the Supabase project. Connection via the usual PG* variables, e.g.
#   PGHOST=/tmp/pgclub PGPORT=54329 PGUSER=postgres supabase/pilot/tests/run-local.sh
set -euo pipefail
DB="${PILOT_TEST_DB:-pilot_test}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$DIR/tests/00_supabase_shim.sql"
for f in "$DIR"/migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null; done
if [ "${SKIP_RLS_TESTS:-}" != "1" ]; then
  # Every file runs (so all results show), and any failure fails the run (CI).
  failed=0
  for t in "$DIR"/tests/[0-9][0-9]_*_test.sql; do
    if ! out=$("${PSQL[@]}" -d "$DB" -f "$t" 2>&1); then
      failed=1
    fi
    printf '%s\n' "$out" | grep -E "FAIL|ERROR|passed" || true
  done
  if [ "$failed" != 0 ]; then
    echo "Some access-rule tests failed." >&2
    exit 1
  fi
fi
