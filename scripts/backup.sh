#!/bin/sh
# Sauvegarde PostgreSQL + médias/avatars dans ./backups (rotation 7 jours).
set -eu
cd "$(dirname "$0")/.."
. ./.env
DOCKER="${DOCKER:-docker}"
TS=$(date +%Y%m%d-%H%M%S)
DIR="backups/$TS"
mkdir -p "$DIR"
$DOCKER compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$DIR/db.dump"
for v in media_data avatar_data; do
  $DOCKER run --rm -v "$(basename "$PWD" | tr 'A-Z' 'a-z')_$v:/data:ro" -v "$PWD/$DIR:/out" \
    docker.io/library/alpine:3 tar czf "/out/$v.tar.gz" -C /data .
done
find backups -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
echo "Sauvegarde créée : $DIR"
