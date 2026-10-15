#!/usr/bin/env bash
# Construit, migre et vérifie une pile dédiée ; ne nettoie que les ressources créées ici.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")/../.."
readonly project=transcendence_publication
compose=(docker compose -p "$project" --env-file /dev/null -f tests/music/compose.yml -f tests/publication/compose.yml)
for kind in container volume network; do
  case "$kind" in
    container) existing="$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ;;
    volume) existing="$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ;;
    network) existing="$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ;;
  esac
  [[ -z "$existing" ]] || { echo "Refusing existing publication test resources" >&2; exit 1; }
done
"${compose[@]}" config --quiet
created=false
# Conserve le code de sortie du scénario et nettoie uniquement son projet isolé.
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$created" == true ]]; then "${compose[@]}" down --volumes --remove-orphans || status=1; fi
  exit "$status"
}
trap cleanup EXIT
"${compose[@]}" build
created=true
"${compose[@]}" up -d --wait nginx
node tests/publication/verify-publication.mjs
