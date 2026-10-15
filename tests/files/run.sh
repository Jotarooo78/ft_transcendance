#!/usr/bin/env bash
# Vérifie le parcours audio/pochette dans une pile neuve, sans arrêter la pile de développement.
set -Eeuo pipefail
umask 077
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/../.." && pwd)"
cd "$repo_dir"
readonly project=transcendence_audio_cover
compose=(docker compose -p "$project" --env-file /dev/null -f tests/music/compose.yml -f tests/files/compose.yml)
work_dir="$(mktemp -d /tmp/transcendence-files-XXXXXX)"
phase=guard
created=false
complete=false
# Supprime seulement les ressources créées par cette invocation après refus de toute cible préexistante.
cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then printf '[FILES] FAIL phase=%s; evidence=%s\n' "$phase" "$work_dir" >&2; fi
  if [[ "$created" == true ]]; then
    "${compose[@]}" down --volumes --remove-orphans || status=1
  fi
  rm -f -- "$work_dir/config.json"
  if (( status == 0 )) && [[ "$complete" == true ]]; then
    printf '[FILES] PASS audio/cover, persistence, isolation, Chromium and non-regression; revision=%s\n' "$revision"
  fi
  exit "$status"
}
trap cleanup EXIT
[[ "$(git rev-parse --show-toplevel)" == "$repo_dir" ]]
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]]
revision="$(git rev-parse HEAD)"
export FILES_BASE_URL=https://127.0.0.1:4443
"${compose[@]}" config --quiet
"${compose[@]}" config --format json > "$work_dir/config.json"
# Contrôle les noms réellement résolus et l'unique port avant toute création/nettoyage.
node --input-type=module - "$work_dir/config.json" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(config.name,'transcendence_audio_cover');
assert.deepEqual(Object.keys(config.volumes).sort(),['music_avatar_data','music_db_data','music_media_data']);
for(const [key,volume] of Object.entries(config.volumes)) assert.ok(!volume.external && volume.name===`transcendence_audio_cover_${key}`);
for(const network of Object.values(config.networks)) assert.ok(!network.external && network.name.startsWith('transcendence_audio_cover_'));
for(const service of Object.values(config.services)) assert.ok(!service.container_name && !service.env_file);
const ports=Object.values(config.services).flatMap(service=>service.ports??[]);
assert.equal(ports.length,1); assert.equal(ports[0].host_ip,'127.0.0.1'); assert.equal(String(ports[0].published),'4443');
assert.equal(config.services.db.environment.POSTGRES_DB,'transcendence_music');
console.log('[FILES] Guard: dedicated project, fresh volumes and loopback HTTPS port');
JS
# Une pile ou un volume déjà présents exigent leur examen ; ne pas les effacer pour relancer un test.
for kind in container volume network; do
  case "$kind" in
    container) existing="$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ;;
    volume) existing="$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ;;
    network) existing="$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ;;
  esac
  [[ -z "$existing" ]] || { printf 'Refusing existing test %s resources\n' "$kind" >&2; exit 1; }
done
for key in music_db_data music_media_data music_avatar_data; do
  if docker volume inspect "${project}_${key}" >/dev/null 2>&1; then echo 'Refusing existing named volume' >&2; exit 1; fi
done
if docker network inspect "${project}_default" >/dev/null 2>&1; then echo 'Refusing existing named network' >&2; exit 1; fi
phase=build
"${compose[@]}" build > "$work_dir/build.log" 2>&1
phase=media-unit
created=true
"${compose[@]}" run --rm --no-deps migrate-media npm test
phase=frontend
"${compose[@]}" run --rm --no-deps frontend sh -ec 'npm run lint && npm run build && npm run test:music'
phase=browser-tools
npm ci --prefix "$script_dir"
npm run install:browser --prefix "$script_dir"
phase=startup
"${compose[@]}" up -d --wait nginx
node --input-type=module -e 'import {waitReady,sql} from "./tests/files/verify-files.mjs"; await waitReady(); sql("DO $$ BEGIN IF (SELECT count(*) FROM media.assets)<>0 OR (SELECT count(*) FROM auth.accounts)<>0 THEN RAISE EXCEPTION '\''Test database not empty'\''; END IF; END $$;");'
"${compose[@]}" exec -T media-service npm run seed:demo
"${compose[@]}" exec -T catalog-service npm run seed:demo
phase=https
node tests/files/verify-files.mjs initial "$work_dir/state.json"
phase=media-restart
"${compose[@]}" restart media-service
node tests/files/verify-files.mjs verify "$work_dir/state.json"
phase=postgres-restart
"${compose[@]}" restart db
node tests/files/verify-files.mjs verify "$work_dir/state.json"
phase=catalogue-outage
node tests/files/verify-files.mjs catalog-down "$work_dir/state.json"
phase=non-regression
node tests/files/verify-files.mjs non-regression "$work_dir/state.json"
phase=chromium
npm test --prefix "$script_dir"
phase=delete
node tests/files/verify-files.mjs delete "$work_dir/state.json"
phase=clean-disk
"${compose[@]}" exec -T media-service node --input-type=module -e 'import {readdir} from "node:fs/promises"; const files=await readdir("/data/audio"); if(files.length!==3 || ![1,2,3].every(n=>files.includes("demo-"+n+".wav"))) throw new Error("Unexpected Media files"); console.log("[FILES] PASS only three demo originals remain");'
complete=true
