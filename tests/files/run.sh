#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/../.." && pwd)"
cd "$repo_dir"
work_dir="$(mktemp -d /tmp/transcendence-files-XXXXXX)"
campaign="${work_dir##*/}"
readonly project=common_repo
base=(docker compose -p "$project" -f "$repo_dir/docker-compose.yml")
fresh=("${base[@]}" -f "$work_dir/volumes.yml")
runtime=(nginx frontend auth-service user-service catalog-service media-service library-service playback-service db)
volumes=()
phase=guard
changed=false
complete=false

check() { node "$script_dir/check-stack.mjs" "$1" "$work_dir" "$campaign"; }
cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then printf '[FILES] FAIL phase=%s\n' "$phase" >&2; fi
  if [[ "$changed" == true ]]; then
    "${fresh[@]}" stop "${runtime[@]}" || status=1
    "${base[@]}" up -d --no-deps db || status=1
    "${base[@]}" up -d --no-deps auth-service user-service catalog-service media-service library-service playback-service frontend nginx || status=1
    if check mounted-original; then
      unset FILES_COMPOSE_OVERRIDE
      node --input-type=module -e 'import {waitReady} from "./tests/files/verify-files.mjs"; await waitReady();' || status=1
      if (( ${#volumes[@]} == 3 )) && check disposable; then
        docker volume rm "${volumes[@]}" || status=1
        check absent || status=1
      else status=1; fi
    else status=1; fi
  elif (( ${#volumes[@]} > 0 )); then
    # Only resources created and tracked by this invocation, before any mount.
    for volume in "${volumes[@]}"; do
      if [[ "$(docker volume inspect --format '{{index .Labels "codex.files.campaign"}}' "$volume")" == "$campaign" ]]; then docker volume rm "$volume" || status=1; else status=1; fi
    done
  fi
  rm -f -- "$work_dir/config.json"
  if (( status == 0 )) && [[ "$complete" == true ]]; then
    printf '[FILES] PASS all six requirements and non-regression; original stack restored; revision=%s\n' "$revision"
  else printf '[FILES] Evidence and recovery targets retained at %s\n' "$work_dir" >&2; fi
  exit "$status"
}
trap cleanup EXIT

[[ "$(git rev-parse --show-toplevel)" == "$repo_dir" ]]
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]]
revision="$(git rev-parse HEAD)"
printf '[FILES] Revision=%s Node=%s npm=%s Compose=%s\n' "$revision" "$(node --version)" "$(npm --version)" "$(docker compose version --short)"
if [[ -n "$(git status --porcelain -- tests/files services frontend nginx database README.md)" ]]; then printf '[FILES] Source includes local changes; revision identifies committed base.\n'; fi
"${base[@]}" config --quiet
"${base[@]}" config --format json > "$work_dir/config.json"
check prepare
rm -f -- "$work_dir/config.json"
phase=build
"${base[@]}" build auth-service user-service catalog-service media-service library-service playback-service frontend nginx migrate-auth migrate-users migrate-catalog migrate-media migrate-library migrate-playback
phase=service-tests
for service in migrate-auth migrate-users migrate-catalog migrate-media migrate-library migrate-playback; do "${base[@]}" run --rm --no-deps "$service" npm test; done
phase=frontend
npm run lint --prefix frontend
npm run build --prefix frontend
npm run test:music --prefix frontend
phase=browser-tools
npm ci --prefix "$script_dir"
npm run install:browser --prefix "$script_dir"
"$script_dir/node_modules/.bin/playwright" --version
node --input-type=module -e 'import {chromium} from "./tests/files/node_modules/playwright/index.mjs"; const browser=await chromium.launch(); console.log("[FILES] Chromium="+browser.version()); await browser.close();'
phase=fresh-volumes
for key in db_data media_data avatar_data; do
  volume="common_repo_${campaign//-/_}_${key}"
  if docker volume inspect "$volume" >/dev/null 2>&1; then printf 'Refusing existing campaign volume\n' >&2; exit 1; fi
  docker volume create --label "codex.files.campaign=$campaign" --label codex.files.disposable=true --label "com.docker.compose.project=$project" "$volume"
  volumes+=("$volume")
done
check disposable
changed=true
"${base[@]}" stop "${runtime[@]}"
export FILES_COMPOSE_OVERRIDE="$work_dir/volumes.yml"
export FILES_BASE_URL=https://127.0.0.1:1443
phase=migrations
"${fresh[@]}" up -d --no-deps db
for service in migrate-auth migrate-users migrate-catalog migrate-media migrate-library migrate-playback; do "${fresh[@]}" run --rm "$service"; done
"${fresh[@]}" run --rm --no-deps apply-permissions
phase=startup
"${fresh[@]}" up -d --no-deps auth-service user-service catalog-service media-service library-service playback-service frontend nginx
check mounted-fresh
node --input-type=module -e 'import {waitReady,sql} from "./tests/files/verify-files.mjs"; await waitReady(); sql("DO $$ BEGIN IF (SELECT count(*) FROM media.assets)<>0 OR (SELECT count(*) FROM auth.accounts)<>0 OR (SELECT count(*) FROM catalog.tracks)<>0 THEN RAISE EXCEPTION '\''Fresh campaign is not empty'\''; END IF; END $$;"); console.log("[FILES] PASS empty application tables after all six migrations");'
"${fresh[@]}" exec -T media-service ffmpeg -version
"${fresh[@]}" exec -T media-service npm run seed:demo
"${fresh[@]}" exec -T catalog-service npm run seed:demo
phase=https-initial
node "$script_dir/verify-files.mjs" initial "$work_dir/state.json"
phase=media-persistence
"${fresh[@]}" restart media-service
node "$script_dir/verify-files.mjs" verify "$work_dir/state.json"
phase=postgres-persistence
"${fresh[@]}" restart db
node "$script_dir/verify-files.mjs" verify "$work_dir/state.json"
phase=catalogue-outage
node "$script_dir/verify-files.mjs" catalog-down "$work_dir/state.json"
phase=non-regression
node "$script_dir/verify-files.mjs" non-regression "$work_dir/state.json"
phase=chromium
npm test --prefix "$script_dir"
phase=delete
node "$script_dir/verify-files.mjs" delete "$work_dir/state.json"
phase=verify-cleanup
"${fresh[@]}" exec -T media-service node --input-type=module -e 'import {readdir} from "node:fs/promises"; const files=await readdir("/data/audio"); if(files.length!==3 || ![1,2,3].every(n=>files.includes("demo-"+n+".wav"))) throw new Error("Unexpected remaining Media files"); console.log("[FILES] PASS only three unchanged demo originals remain");'
complete=true
phase=restore-and-cleanup
