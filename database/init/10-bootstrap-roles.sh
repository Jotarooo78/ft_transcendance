#!/usr/bin/env bash
set -Eeuo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${AUTH_MIGRATION_PASSWORD:?AUTH_MIGRATION_PASSWORD is required}"
: "${AUTH_RUNTIME_PASSWORD:?AUTH_RUNTIME_PASSWORD is required}"
: "${USERS_MIGRATION_PASSWORD:?USERS_MIGRATION_PASSWORD is required}"
: "${USERS_RUNTIME_PASSWORD:?USERS_RUNTIME_PASSWORD is required}"
: "${CATALOG_MIGRATION_PASSWORD:?CATALOG_MIGRATION_PASSWORD is required}"
: "${CATALOG_RUNTIME_PASSWORD:?CATALOG_RUNTIME_PASSWORD is required}"
: "${MEDIA_MIGRATION_PASSWORD:?MEDIA_MIGRATION_PASSWORD is required}"
: "${MEDIA_RUNTIME_PASSWORD:?MEDIA_RUNTIME_PASSWORD is required}"
: "${LIBRARY_MIGRATION_PASSWORD:?LIBRARY_MIGRATION_PASSWORD is required}"
: "${LIBRARY_RUNTIME_PASSWORD:?LIBRARY_RUNTIME_PASSWORD is required}"
: "${PLAYBACK_MIGRATION_PASSWORD:?PLAYBACK_MIGRATION_PASSWORD is required}"
: "${PLAYBACK_RUNTIME_PASSWORD:?PLAYBACK_RUNTIME_PASSWORD is required}"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set ON_ERROR_STOP=1 \
  --set database_name="$POSTGRES_DB" \
  --set auth_migration_password="$AUTH_MIGRATION_PASSWORD" \
  --set auth_runtime_password="$AUTH_RUNTIME_PASSWORD" \
  --set users_migration_password="$USERS_MIGRATION_PASSWORD" \
  --set users_runtime_password="$USERS_RUNTIME_PASSWORD" \
  --set catalog_migration_password="$CATALOG_MIGRATION_PASSWORD" \
  --set catalog_runtime_password="$CATALOG_RUNTIME_PASSWORD" \
  --set media_migration_password="$MEDIA_MIGRATION_PASSWORD" \
  --set media_runtime_password="$MEDIA_RUNTIME_PASSWORD" \
  --set library_migration_password="$LIBRARY_MIGRATION_PASSWORD" \
  --set library_runtime_password="$LIBRARY_RUNTIME_PASSWORD" \
  --set playback_migration_password="$PLAYBACK_MIGRATION_PASSWORD" \
  --set playback_runtime_password="$PLAYBACK_RUNTIME_PASSWORD" \
  --file /permissions/bootstrap-roles.sql
