#!/usr/bin/env bash
# Creates a disposable local database with Supabase stubs + all migrations + seed.
# Usage: TEST_DATABASE_URL=postgresql://postgres@localhost:5432/mosa3da_test tests/db/setup-local.sh
set -euo pipefail
: "${TEST_DATABASE_URL:?set TEST_DATABASE_URL}"
case "$TEST_DATABASE_URL" in *supabase.co*|*pooler.supabase.com*) echo "Refusing: looks like a Supabase project"; exit 1;; esac
DB_NAME="${TEST_DATABASE_URL##*/}"; ADMIN_URL="${TEST_DATABASE_URL%/*}/postgres"
psql "$ADMIN_URL" -q -c "drop database if exists \"$DB_NAME\"" -c "create database \"$DB_NAME\""
psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f tests/db/supabase-stub.sql
for f in supabase/migrations/*.sql; do psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$TEST_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f supabase/seed.sql
echo "✓ $DB_NAME ready"
