#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/../.." && pwd)"
compose_file="$script_dir/compose.yml"
readonly project_name=transcendence_e2e
compose=(docker compose -p "$project_name" --env-file /dev/null -f "$compose_file")
phase=guard
work_dir="$(mktemp -d /tmp/transcendence-e2e.XXXXXX)"
cleanup_enabled=false
campaign_complete=false
revision="$(git -C "$repo_dir" rev-parse HEAD)"

cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then echo "[PCE] FAIL phase=$phase" >&2; fi
  if [[ "$cleanup_enabled" == true ]]; then
    if (( status != 0 )); then
      "${compose[@]}" ps --all >&2 || true
      # HTTP and Prisma logs can include sensitive fields; don't dump them here.
      echo "Inspect the isolated service for this phase; do not print credentials or JWTs." >&2
    fi
    if ! "${compose[@]}" down --volumes --remove-orphans; then
      echo '[PCE] FAIL phase=cleanup' >&2
      status=1
    fi
  fi
  rm -f -- "$work_dir/state.json" "$work_dir/config.json"
  rmdir -- "$work_dir" || status=1
  if (( status == 0 )) && [[ "$campaign_complete" == true ]]; then
    printf '[PCE] PASS cleanup\n[PCE] PASS ALL: Auth, Users, frontend lint/build, migrations, permissions, HTTPS API, SQL, services/database restarts, refusals, Chromium; revision=%s\n' "$revision"
  fi
  exit "$status"
}
trap cleanup EXIT

[[ "$project_name" == transcendence_e2e && "$compose_file" == "$repo_dir/tests/e2e/compose.yml" ]]
[[ "$(git -C "$repo_dir" rev-parse --show-toplevel)" == "$repo_dir" ]]
export E2E_HTTPS_PORT="${E2E_HTTPS_PORT:-2443}"
[[ "$E2E_HTTPS_PORT" =~ ^[0-9]+$ && "$E2E_HTTPS_PORT" -gt 1024 && "$E2E_HTTPS_PORT" -le 65535 && "$E2E_HTTPS_PORT" != 1443 ]]
export E2E_BASE_URL="https://127.0.0.1:$E2E_HTTPS_PORT"
cd "$repo_dir"
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]]
printf '[PCE] Tools: Node=%s; npm=%s; Docker=%s; Compose=%s\n' "$(node --version)" "$(npm --version)" "$(docker --version)" "$(docker compose version --short)"
printf '[PCE] Revision: %s\n' "$revision"
if ! git diff --quiet HEAD -- tests/e2e services frontend nginx database; then
  echo '[PCE] Source has local modifications; revision identifies its committed base.'
fi
phase=configuration
"${compose[@]}" config --quiet
"${compose[@]}" config --format json > "$work_dir/config.json"
node --input-type=module - "$work_dir/config.json" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(config.name, 'transcendence_e2e');
assert.deepEqual(Object.keys(config.volumes).sort(), ['e2e_avatar_data', 'e2e_db_data']);
for (const [key, volume] of Object.entries(config.volumes)) {
  assert.ok(!volume.external && volume.name === `transcendence_e2e_${key}`);
}
for (const network of Object.values(config.networks)) {
  assert.ok(!network.external && network.name.startsWith('transcendence_e2e_'));
}
for (const service of Object.values(config.services)) assert.ok(!service.container_name && !service.env_file);
console.log('[PCE] Target: project=transcendence_e2e; volumes=transcendence_e2e_e2e_db_data,transcendence_e2e_e2e_avatar_data');
JS
printf '[PCE] Compose: %s\n' "$compose_file"
cleanup_enabled=true
"${compose[@]}" down --volumes --remove-orphans

phase=build
"${compose[@]}" build
phase=auth-tests
"${compose[@]}" run --rm --no-deps migrate-auth npm test
printf '[PCE] PASS %s\n' "$phase"
phase=users-tests
"${compose[@]}" run --rm --no-deps migrate-users npm test
printf '[PCE] PASS %s\n' "$phase"
phase=frontend-lint-build
"${compose[@]}" run --rm --no-deps frontend sh -ec 'npm run lint && npm run build'
printf '[PCE] PASS %s\n' "$phase"
phase=browser-install
npm ci --prefix "$script_dir"
npm run install:browser --prefix "$script_dir"
printf '[PCE] Playwright: %s\n' "$("$script_dir/node_modules/.bin/playwright" --version)"
phase=migrations-permissions-readiness
"${compose[@]}" up -d --wait nginx

sql_assertions() {
  "${compose[@]}" exec -T db psql --username e2e_admin --dbname transcendence_e2e \
    --set ON_ERROR_STOP=1 --file /dev/stdin < "$script_dir/assert-state.sql"
}
phase=initial
node "$script_dir/http-scenario.mjs" initial "$work_dir/state.json"
sql_assertions
printf '[PCE] PASS %s\n' "$phase"

phase=after-services-restart
"${compose[@]}" stop auth-service user-service
# Start in the reverse dependency order without rerunning migrations. Docker
# may reassign addresses; HTTPS must recover without restarting Nginx.
"${compose[@]}" up -d --no-deps auth-service
"${compose[@]}" up -d --no-deps user-service
node "$script_dir/http-scenario.mjs" verify "$work_dir/state.json"
sql_assertions
printf '[PCE] PASS %s\n' "$phase"

phase=after-db-restart
"${compose[@]}" restart db
# Readiness of the process alone doesn't prove the database is accepting queries.
for attempt in {1..60}; do
  if "${compose[@]}" exec -T db pg_isready -U e2e_admin -d transcendence_e2e >/dev/null; then break; fi
  if (( attempt == 60 )); then exit 1; fi
  sleep 1
done
node "$script_dir/http-scenario.mjs" verify "$work_dir/state.json"
sql_assertions
printf '[PCE] PASS %s\n' "$phase"

phase=negative-cases
node "$script_dir/http-scenario.mjs" negative "$work_dir/state.json"
sql_assertions
printf '[PCE] PASS %s\n' "$phase"

phase=browser
# The mutation probe is a separate deliberately failing diagnostic, never a
# successful campaign. Keep the normal oracle enabled regardless of caller env.
PCE_MUTATION_CHECK=0 npm test --prefix "$script_dir"
printf '[PCE] PASS %s\n' "$phase"
campaign_complete=true
