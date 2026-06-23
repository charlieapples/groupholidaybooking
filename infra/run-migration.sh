#!/usr/bin/env bash
# Run a .sql migration against Supabase via the Management API.
# Credentials live in .secrets/supabase.env (gitignored) — never committed.
#
# Usage: bash infra/run-migration.sh infra/supabase/migrations/020_whatever.sql
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
source "${here}/../.secrets/supabase.env"

file="${1:?usage: run-migration.sh <path-to.sql>}"
# JSON-encode the SQL body safely (handles quotes/newlines).
payload=$(python -c "import json,sys; print(json.dumps({'query': open(sys.argv[1], encoding='utf-8').read()}))" "$file")

echo "Running ${file} against project ${SUPABASE_REF}…"
curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_PAT}" \
  -H "Content-Type: application/json" \
  -d "${payload}"
echo
