#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/../.." && pwd)"
readonly project_name=transcendence_music
compose_file="$script_dir/compose.yml"
compose=(docker compose -p "$project_name" --env-file /dev/null -f "$compose_file")
campaign="${1:-catalog}"
[[ "$campaign" == catalog ]] || { echo 'Expected campaign: catalog' >&2; exit 2; }
phase=guard
cleanup_enabled=false
complete=false
work_dir="$(mktemp -d /tmp/transcendence-music.XXXXXX)"
revision="$(git -C "$repo_dir" rev-parse HEAD)"

cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then echo "[MUSIC] FAIL phase=$phase" >&2; fi
  if [[ "$cleanup_enabled" == true ]]; then
    if (( status != 0 )); then "${compose[@]}" ps --all >&2 || true; fi
    if ! "${compose[@]}" down --volumes --remove-orphans; then status=1; fi
  fi
  rm -f -- "$work_dir/config.json"
  rmdir -- "$work_dir" || status=1
  if (( status == 0 )) && [[ "$complete" == true ]]; then
    printf '[MUSIC] PASS cleanup\n[MUSIC] PASS %s revision=%s\n' "$campaign" "$revision"
  fi
  exit "$status"
}
trap cleanup EXIT

[[ "$(git -C "$repo_dir" rev-parse --show-toplevel)" == "$repo_dir" ]]
[[ "$compose_file" == "$repo_dir/tests/music/compose.yml" && "$project_name" == transcendence_music ]]
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]]
export MUSIC_BASE_URL=https://127.0.0.1:3443
cd "$repo_dir"
printf '[MUSIC] Tools Node=%s npm=%s Docker=%s Compose=%s\n' "$(node --version)" "$(npm --version)" "$(docker --version)" "$(docker compose version --short)"
printf '[MUSIC] Revision=%s campaign=%s\n' "$revision" "$campaign"
if [[ -n "$(git status --porcelain -- tests/music services frontend nginx database)" ]]; then
  echo '[MUSIC] Source has local modifications; revision identifies committed base.'
fi
phase=configuration
"${compose[@]}" config --quiet
"${compose[@]}" config --format json > "$work_dir/config.json"
node --input-type=module - "$work_dir/config.json" "$compose_file" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const raw=readFileSync(process.argv[3],'utf8');
assert.ok(!/^\s*(env_file|container_name|external):/m.test(raw));
assert.equal(config.name,'transcendence_music');
assert.deepEqual(Object.keys(config.volumes).sort(),['music_avatar_data','music_db_data','music_media_data']);
for (const [key,v] of Object.entries(config.volumes)) assert.ok(!v.external&&v.name===`transcendence_music_${key}`);
for (const n of Object.values(config.networks)) assert.ok(!n.external&&n.name.startsWith('transcendence_music_'));
for (const s of Object.values(config.services)) assert.ok(!s.container_name&&!s.env_file);
const ports=Object.values(config.services).flatMap(s=>s.ports??[]);
assert.equal(ports.length,1); assert.equal(ports[0].host_ip,'127.0.0.1'); assert.equal(String(ports[0].published),'3443');
assert.equal(config.services.db.environment.POSTGRES_DB,'transcendence_music');
console.log('[MUSIC] Guard: isolated project, database, volumes, network and HTTPS port');
JS
cleanup_enabled=true
"${compose[@]}" down --volumes --remove-orphans
phase=build
"${compose[@]}" build
phase=catalog-unit
"${compose[@]}" run --rm --no-deps migrate-catalog npm test
phase=frontend-lint-build
"${compose[@]}" run --rm --no-deps frontend sh -ec 'npm run lint && npm run build'
phase=browser-install
npm ci --prefix "$script_dir"
npm run install:browser --prefix "$script_dir"
printf '[MUSIC] Playwright=%s\n' "$("$script_dir/node_modules/.bin/playwright" --version)"
phase=migrations-permissions-readiness
"${compose[@]}" up -d --wait nginx
sql_file() {
  "${compose[@]}" exec -T db psql -U e2e_admin -d transcendence_music -v ON_ERROR_STOP=1 "$@" -f /dev/stdin
}
phase=catalog-seed
for pass in 1 2; do
  "${compose[@]}" run --rm --no-deps catalog-service npm run seed:demo
  sql_file < "$script_dir/assert-catalog.sql"
done
phase=catalog-http
node "$script_dir/http-scenario.mjs" catalog
phase=catalog-edge
sql_file -v cleanup=false < "$script_dir/catalog-edge.sql"
node "$script_dir/http-scenario.mjs" catalog-edge
sql_file -v cleanup=true < "$script_dir/catalog-edge.sql"
phase=catalog-restart
"${compose[@]}" stop catalog-service
"${compose[@]}" up -d --no-deps --wait catalog-service
node "$script_dir/http-scenario.mjs" catalog-verify
sql_file < "$script_dir/assert-catalog.sql"
phase=database-restart
"${compose[@]}" restart db
node "$script_dir/http-scenario.mjs" catalog-verify
sql_file < "$script_dir/assert-catalog.sql"
phase=browser
npm test --prefix "$script_dir" -- --grep catalog
complete=true
