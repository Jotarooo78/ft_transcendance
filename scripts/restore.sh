#!/bin/sh
# Restaure une sauvegarde : ./scripts/restore.sh backups/<horodatage>
set -eu
[ $# -eq 1 ] || { echo "usage: $0 backups/<horodatage>"; exit 1; }
cd "$(dirname "$0")/.."
. ./.env
DOCKER="${DOCKER:-docker}"
DIR="$1"
$DOCKER compose exec -T db pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$DIR/db.dump"
for v in media_data avatar_data; do
  [ -f "$DIR/$v.tar.gz" ] && $DOCKER run --rm -v "$(basename "$PWD" | tr 'A-Z' 'a-z')_$v:/data" -v "$PWD/$DIR:/in:ro" \
    docker.io/library/alpine:3 sh -c "rm -rf /data/* && tar xzf /in/$v.tar.gz -C /data"
done
echo "Restauration terminée depuis $DIR"
