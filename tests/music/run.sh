#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/../.." && pwd)"
readonly project_name=transcendence_music
compose_file="$script_dir/compose.yml"
compose=(docker compose -p "$project_name" --env-file /dev/null -f "$compose_file")
campaign="${1:-catalog}"
[[ "$campaign" == catalog || "$campaign" == media || "$campaign" == library || "$campaign" == playback ]] || { echo 'Expected campaign: catalog, media, library or playback' >&2; exit 2; }
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
if [[ "$campaign" != catalog ]]; then
  phase=media-unit
  "${compose[@]}" run --rm --no-deps migrate-media npm test
fi
if [[ "$campaign" == library || "$campaign" == playback ]]; then
  phase=library-unit
  "${compose[@]}" run --rm --no-deps migrate-library npm test
fi
if [[ "$campaign" == playback ]]; then
  phase=playback-unit
  "${compose[@]}" run --rm --no-deps migrate-playback npm test
  phase=frontend-music-unit
  "${compose[@]}" run --rm --no-deps frontend npm run test:music
fi
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
browser_pattern=catalog
if [[ "$campaign" != catalog ]]; then
  phase=media-seed
  for pass in 1 2; do
    "${compose[@]}" exec -T media-service npm run seed:demo
    sql_file < "$script_dir/assert-media.sql"
  done
  phase=media-fixtures
  sql_file -v cleanup=false < "$script_dir/media-edge.sql"
  "${compose[@]}" exec -T media-service node --input-type=module -e 'import {copyFile} from "node:fs/promises"; import {constants} from "node:fs"; for(const name of ["edge-pending.wav","edge-private.wav"]) await copyFile("/data/audio/demo-1.wav", "/data/audio/"+name, constants.COPYFILE_EXCL);'
  phase=media-http
  node "$script_dir/http-scenario.mjs" media
  phase=media-catalogue-outage
  "${compose[@]}" stop catalog-service
  node "$script_dir/http-scenario.mjs" media-unavailable
  "${compose[@]}" up -d --no-deps --wait catalog-service
  phase=media-restarts
  "${compose[@]}" restart media-service
  node "$script_dir/http-scenario.mjs" media-verify
  "${compose[@]}" restart db
  node "$script_dir/http-scenario.mjs" media-verify
  sql_file < "$script_dir/assert-media.sql"
  phase=media-fixtures-cleanup
  sql_file -v cleanup=true < "$script_dir/media-edge.sql"
  "${compose[@]}" exec -T media-service node --input-type=module -e 'import {unlink} from "node:fs/promises"; for(const name of ["edge-pending.wav","edge-private.wav"]) await unlink("/data/audio/"+name);'
  node "$script_dir/http-scenario.mjs" catalog-verify
  browser_pattern='catalog|media'
fi
if [[ "$campaign" == library || "$campaign" == playback ]]; then
  phase=library-http
  node "$script_dir/http-scenario.mjs" library
  library_fixture="$(cat /tmp/transcendence-music-library-state.json)"
  sql_file -v cleanup=false -v fixture="$library_fixture" < "$script_dir/assert-library.sql"
  phase=library-catalogue-outage
  "${compose[@]}" stop catalog-service
  node "$script_dir/http-scenario.mjs" library-unavailable
  "${compose[@]}" up -d --no-deps --wait catalog-service
  phase=library-restarts
  "${compose[@]}" restart library-service
  node "$script_dir/http-scenario.mjs" library-verify
  "${compose[@]}" restart db
  node "$script_dir/http-scenario.mjs" library-verify
  sql_file -v cleanup=false -v fixture="$library_fixture" < "$script_dir/assert-library.sql"
  phase=library-fixtures-cleanup
  node "$script_dir/http-scenario.mjs" library-cleanup
  sql_file -v cleanup=true -v fixture="$library_fixture" < "$script_dir/assert-library.sql"
  browser_pattern='catalog|media|library'
fi
if [[ "$campaign" == playback ]]; then
  phase=playback-http
  node "$script_dir/http-scenario.mjs" playback
  playback_fixture="$(cat /tmp/transcendence-music-playback-state.json)"
  sql_file -v fixture="$playback_fixture" < "$script_dir/assert-playback.sql"
  phase=playback-catalogue-outage
  "${compose[@]}" stop catalog-service
  node "$script_dir/http-scenario.mjs" playback-unavailable
  "${compose[@]}" up -d --no-deps --wait catalog-service
  phase=playback-restart
  "${compose[@]}" restart playback-service
  node "$script_dir/http-scenario.mjs" playback-verify
  sql_file -v fixture="$playback_fixture" < "$script_dir/assert-playback.sql"
  phase=playback-database-restart
  "${compose[@]}" restart db
  node "$script_dir/http-scenario.mjs" playback-verify
  sql_file -v fixture="$playback_fixture" < "$script_dir/assert-playback.sql"
  browser_pattern='catalog|media|library|playback'
fi
phase=browser
npm test --prefix "$script_dir" -- --grep "$browser_pattern"
complete=true
