#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/../.." && pwd)"
compose_file="$script_dir/compose.yml"
project_name="transcendence_per"
database_name="transcendence_per"

auth_migration_password="per_auth_migration_test_only"
users_migration_password="per_users_migration_test_only"
auth_runtime_password="per_auth_test_only"
users_runtime_password="per_users_test_only"

compose=(docker compose -p "$project_name" -f "$compose_file")

cleanup() {
  local status=$?
  trap - EXIT

  if (( status != 0 )); then
    "${compose[@]}" ps || true
    "${compose[@]}" logs --no-color --tail=160 \
      db migrate-users-bootstrap migrate-users migrate-auth \
      user-service auth-service || true
  fi

  "${compose[@]}" down --volumes --remove-orphans || true
  exit "$status"
}

trap cleanup EXIT

fail() {
  echo "[PER] FAIL: $*" >&2
  return 1
}

if [[ "$project_name" != "transcendence_per" ]]; then
  fail "refusing to run with an unexpected Compose project name"
fi

required_files=(
  "$repo_dir/database/permissions/bootstrap-roles.sql"
  "$repo_dir/database/permissions/assign-owners.sql"
  "$repo_dir/database/permissions/apply-grants.sql"
  "$compose_file"
)

for required_file in "${required_files[@]}"; do
  if [[ ! -s "$required_file" ]]; then
    fail "required file is missing or empty: $required_file"
  fi
done

cd "$repo_dir"

admin_psql() {
  "${compose[@]}" exec -T db \
    psql -X -U per_admin -d "$database_name" -v ON_ERROR_STOP=1 "$@"
}

role_psql() {
  local role=$1
  local password=$2
  shift 2

  "${compose[@]}" exec -T -e PGPASSWORD="$password" db \
    psql -X -h 127.0.0.1 -U "$role" -d "$database_name" \
      -v ON_ERROR_STOP=1 "$@"
}

expect_sqlstate_42501() {
  local role=$1
  local password=$2
  local statement=$3
  local output

  if output=$(role_psql "$role" "$password" \
    -v VERBOSITY=verbose -c "$statement" 2>&1); then
    fail "$role unexpectedly succeeded: $statement"
  fi

  if [[ "$output" != *"42501"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$role failed without the expected SQLSTATE 42501: $statement"
  fi
}

create_roles() {
  admin_psql \
    -v database_name="$database_name" \
    -v auth_migration_password="$auth_migration_password" \
    -v users_migration_password="$users_migration_password" \
    -v auth_runtime_password="$auth_runtime_password" \
    -v users_runtime_password="$users_runtime_password" \
    -f /permissions/bootstrap-roles.sql
}

apply_migrations() {
  "${compose[@]}" run --rm migrate-users-bootstrap

  admin_psql -f /permissions/assign-owners.sql

  "${compose[@]}" run --rm migrate-auth \
    npx prisma migrate resolve \
      --applied 20260910140100_baseline_auth_accounts \
      --config prisma.migration.config.ts
  "${compose[@]}" run --rm migrate-auth

  # This second Users deployment must have nothing left to apply and must be
  # able to read its history using the definitive Users migration role.
  "${compose[@]}" run --rm migrate-users
}

apply_runtime_grants() {
  admin_psql -f /permissions/apply-grants.sql
}

assert_roles_and_owners() {
  admin_psql <<'SQL'
DO $check_roles$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_roles
    WHERE rolname IN (
      'auth_migration', 'users_migration',
      'auth_runtime', 'users_runtime'
    )
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND NOT rolbypassrls
  ) <> 4 THEN
    RAISE EXCEPTION 'PER role attributes do not match the expected matrix';
  END IF;
END
$check_roles$;

DO $check_owners$
BEGIN
  IF EXISTS (
    WITH expected(schemaname, tablename, owner) AS (
      VALUES
        ('auth', 'accounts', 'auth_migration'),
        ('auth', 'outbox_messages', 'auth_migration'),
        ('auth', '_prisma_migrations', 'auth_migration'),
        ('users', 'profiles', 'users_migration'),
        ('users', 'inbox_messages', 'users_migration'),
        ('public', 'users', 'users_migration'),
        ('public', '_prisma_migrations', 'users_migration')
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_tables AS actual
      ON actual.schemaname = expected.schemaname
     AND actual.tablename = expected.tablename
    WHERE actual.tablename IS NULL
       OR actual.tableowner <> expected.owner
  ) THEN
    RAISE EXCEPTION 'PER table ownership does not match the expected matrix';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'auth'
      AND pg_get_userbyid(nspowner) <> 'auth_migration'
  ) OR EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'users'
      AND pg_get_userbyid(nspowner) <> 'users_migration'
  ) THEN
    RAISE EXCEPTION 'PER schema ownership does not match the expected matrix';
  END IF;
END
$check_owners$;
SQL
}

assert_runtime_privileges() {
  admin_psql <<'SQL'
DO $check_runtime_privileges$
BEGIN
  IF NOT has_schema_privilege('auth_runtime', 'auth', 'USAGE')
     OR has_schema_privilege('auth_runtime', 'auth', 'CREATE')
     OR has_schema_privilege('auth_runtime', 'users', 'USAGE')
     OR NOT has_schema_privilege('users_runtime', 'users', 'USAGE')
     OR has_schema_privilege('users_runtime', 'users', 'CREATE')
     OR has_schema_privilege('users_runtime', 'auth', 'USAGE') THEN
    RAISE EXCEPTION 'PER runtime schema privileges do not match the expected matrix';
  END IF;

  IF NOT has_table_privilege('auth_runtime', 'auth.accounts', 'SELECT')
     OR NOT has_table_privilege('auth_runtime', 'auth.accounts', 'INSERT')
     OR NOT has_table_privilege('auth_runtime', 'auth.accounts', 'UPDATE')
     OR has_table_privilege('auth_runtime', 'auth.accounts', 'DELETE')
     OR NOT has_table_privilege('auth_runtime', 'auth.outbox_messages', 'SELECT')
     OR NOT has_table_privilege('auth_runtime', 'auth.outbox_messages', 'INSERT')
     OR NOT has_table_privilege('auth_runtime', 'auth.outbox_messages', 'UPDATE')
     OR has_table_privilege('auth_runtime', 'auth.outbox_messages', 'DELETE')
     OR has_table_privilege('auth_runtime', 'users.profiles', 'SELECT')
     OR has_table_privilege('auth_runtime', 'users.inbox_messages', 'SELECT') THEN
    RAISE EXCEPTION 'PER Auth runtime privileges do not match the expected matrix';
  END IF;

  IF NOT has_table_privilege('users_runtime', 'users.profiles', 'SELECT')
     OR NOT has_table_privilege('users_runtime', 'users.profiles', 'INSERT')
     OR has_table_privilege('users_runtime', 'users.profiles', 'UPDATE')
     OR has_table_privilege('users_runtime', 'users.profiles', 'DELETE')
     OR NOT has_table_privilege('users_runtime', 'users.inbox_messages', 'SELECT')
     OR NOT has_table_privilege('users_runtime', 'users.inbox_messages', 'INSERT')
     OR has_table_privilege('users_runtime', 'users.inbox_messages', 'UPDATE')
     OR has_table_privilege('users_runtime', 'users.inbox_messages', 'DELETE')
     OR has_table_privilege('users_runtime', 'auth.accounts', 'SELECT')
     OR has_table_privilege('users_runtime', 'auth.outbox_messages', 'SELECT') THEN
    RAISE EXCEPTION 'PER Users runtime privileges do not match the expected matrix';
  END IF;

  IF has_table_privilege('auth_runtime', 'public.users', 'SELECT')
     OR has_table_privilege('users_runtime', 'public.users', 'SELECT')
     OR has_table_privilege('auth_runtime', 'auth._prisma_migrations', 'SELECT')
     OR has_table_privilege('users_runtime', 'public._prisma_migrations', 'SELECT') THEN
    RAISE EXCEPTION 'PER runtime can access a legacy or migration-history table';
  END IF;
END
$check_runtime_privileges$;
SQL
}

assert_ddl_boundaries() {
  role_psql auth_migration "$auth_migration_password" \
    -c 'CREATE TABLE auth.per_auth_probe(id integer); DROP TABLE auth.per_auth_probe;'
  role_psql users_migration "$users_migration_password" \
    -c 'CREATE TABLE users.per_users_probe(id integer); DROP TABLE users.per_users_probe;'

  expect_sqlstate_42501 auth_migration "$auth_migration_password" \
    'CREATE TABLE users.per_auth_forbidden(id integer);'
  expect_sqlstate_42501 users_migration "$users_migration_password" \
    'CREATE TABLE auth.per_users_forbidden(id integer);'
  expect_sqlstate_42501 auth_runtime "$auth_runtime_password" \
    'CREATE TABLE auth.per_auth_runtime_forbidden(id integer);'
  expect_sqlstate_42501 users_runtime "$users_runtime_password" \
    'CREATE TABLE users.per_users_runtime_forbidden(id integer);'
}

assert_runtime_boundaries() {
  expect_sqlstate_42501 auth_runtime "$auth_runtime_password" \
    'SELECT * FROM users.profiles LIMIT 0;'
  expect_sqlstate_42501 users_runtime "$users_runtime_password" \
    'SELECT * FROM auth.accounts LIMIT 0;'
  expect_sqlstate_42501 auth_runtime "$auth_runtime_password" \
    'DELETE FROM auth.accounts WHERE false;'
  expect_sqlstate_42501 users_runtime "$users_runtime_password" \
    'DELETE FROM users.profiles WHERE false;'
}

run_installation() {
  local pass=$1

  echo "[PER] installation $pass/2: resetting the isolated stack"
  "${compose[@]}" down --volumes --remove-orphans
  "${compose[@]}" up -d --wait db

  create_roles
  echo "[PER] roles created"

  apply_migrations
  echo "[PER] Users and Auth migrations applied"

  apply_runtime_grants
  assert_roles_and_owners
  echo "[PER] owners verified"

  assert_runtime_privileges
  assert_ddl_boundaries
  assert_runtime_boundaries
  echo "[PER] privilege matrix and DDL isolation verified"

  "${compose[@]}" up -d --wait user-service auth-service
  "${compose[@]}" run --rm scenario
  echo "[PER] runtime HTTP path verified"

  "${compose[@]}" down --volumes --remove-orphans
}

"${compose[@]}" config --quiet
"${compose[@]}" build \
  migrate-users-bootstrap migrate-users migrate-auth user-service auth-service

run_installation 1
run_installation 2

echo "[PER] PASS bootstrap reproducible"
