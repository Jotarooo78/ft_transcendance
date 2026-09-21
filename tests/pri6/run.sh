#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/../.." && pwd)"
compose_file="$script_dir/compose.yml"
project_name="transcendence_pri6"
legacy_database="transcendence_pri2_test_pri6"

compose=(docker compose -p "$project_name" -f "$compose_file")

cleanup() {
  local status=$?
  trap - EXIT

  if (( status != 0 )); then
    "${compose[@]}" ps || true
    "${compose[@]}" logs --no-color --tail=120 db auth-service user-service || true
  fi

  "${compose[@]}" down --volumes --remove-orphans
  exit "$status"
}

trap cleanup EXIT

if [[ "$project_name" != "transcendence_pri6" ]]; then
  echo "Refusing to run with an unexpected Compose project name" >&2
  exit 1
fi

cd "$repo_dir"

"${compose[@]}" down --volumes --remove-orphans
"${compose[@]}" config --quiet
"${compose[@]}" build migrate-users migrate-auth user-service auth-service

echo "[PRI-6] Running Auth and Users static checks and unit tests"
"${compose[@]}" run --no-deps --rm migrate-users npm run typecheck
"${compose[@]}" run --no-deps --rm migrate-users npm test
"${compose[@]}" run --no-deps --rm migrate-auth npm run typecheck
"${compose[@]}" run --no-deps --rm migrate-auth npm test

"${compose[@]}" up -d --wait db

echo "[PRI-6] Applying Users migrations to the fresh database"
"${compose[@]}" run --rm migrate-users

echo "[PRI-6] Applying Auth migrations after Users"
"${compose[@]}" run --rm \
  migrate-auth \
  npx prisma migrate resolve \
    --applied 20260910140100_baseline_auth_accounts \
    --config prisma.migration.config.ts
"${compose[@]}" run --rm migrate-auth

"${compose[@]}" up -d --wait user-service auth-service

echo "[PRI-6] Running signup, login, /me, and expected HTTP failures"
"${compose[@]}" run --rm scenario node http-scenario.mjs initial
"${compose[@]}" exec -T db psql \
  -U pri6 \
  -d transcendence_pri6 \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin < "$script_dir/assert-state.sql"

echo "[PRI-6] Restarting Auth and Users without touching PostgreSQL"
"${compose[@]}" restart auth-service user-service
"${compose[@]}" up -d --wait auth-service user-service
"${compose[@]}" run --rm scenario node http-scenario.mjs resume

echo "[PRI-6] Restarting PostgreSQL while preserving its volume"
"${compose[@]}" restart db
"${compose[@]}" up -d --wait db auth-service user-service
"${compose[@]}" run --rm scenario node http-scenario.mjs resume
"${compose[@]}" exec -T db psql \
  -U pri6 \
  -d transcendence_pri6 \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin < "$script_dir/assert-state.sql"

echo "[PRI-6] Replaying the PRI-2 legacy fixture into a dedicated database"
"${compose[@]}" exec -T db createdb -U pri6 "$legacy_database"
"${compose[@]}" exec -T db psql \
  -U pri6 \
  -d "$legacy_database" \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < "$repo_dir/services/user-service/prisma/migrations/20260905155209_init/migration.sql"
"${compose[@]}" exec -T db psql \
  -U pri6 \
  -d "$legacy_database" \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < "$repo_dir/services/user-service/prisma/tests/pri2/legacy_fixture_valid.sql"

legacy_public_url="postgresql://pri6:pri6_test_only@db:5432/${legacy_database}?schema=public"
legacy_auth_url="postgresql://pri6:pri6_test_only@db:5432/${legacy_database}?schema=auth"

"${compose[@]}" run --rm \
  -e USER_MIGRATION_DATABASE_URL="$legacy_public_url" \
  migrate-users \
  npx prisma migrate resolve \
    --applied 20260905155209_init \
    --config prisma.migration.config.ts
"${compose[@]}" run --rm \
  -e USER_MIGRATION_DATABASE_URL="$legacy_public_url" \
  migrate-users
"${compose[@]}" run --rm \
  -e AUTH_MIGRATION_DATABASE_URL="$legacy_auth_url" \
  migrate-auth \
  npx prisma migrate resolve \
    --applied 20260910140100_baseline_auth_accounts \
    --config prisma.migration.config.ts
"${compose[@]}" run --rm \
  -e AUTH_MIGRATION_DATABASE_URL="$legacy_auth_url" \
  migrate-auth

"${compose[@]}" exec -T db psql \
  -U pri6 \
  -d "$legacy_database" \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < "$repo_dir/services/user-service/prisma/tests/pri2/verify_after.sql"
"${compose[@]}" exec -T db psql \
  -U pri6 \
  -d "$legacy_database" \
  -v ON_ERROR_STOP=1 \
  -f /dev/stdin \
  < "$script_dir/assert-legacy-current.sql"

echo "[PRI-6] PASS: fresh install, HTTP path, both restart levels, failures, and legacy migration"
