#!/bin/sh
# Sauvegarde automatique : une fois par jour, dump PostgreSQL + médias/avatars, conservés 7 jours.
set -eu
while true; do
  DIR="/backups/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$DIR"
  if pg_dump -Fc > "$DIR/db.dump" \
    && tar czf "$DIR/media_data.tar.gz" -C /media_data . \
    && tar czf "$DIR/avatar_data.tar.gz" -C /avatar_data .; then
    echo "Sauvegarde OK : $DIR"
  else
    echo "Sauvegarde ECHEC : $DIR"; rm -rf "$DIR"
  fi
  find /backups -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
  sleep 86400
done
