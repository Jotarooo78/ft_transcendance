#!/usr/bin/env bash
# Orchestre la campagne décrite dans le README voisin ; les gardes et le traitement de sortie font partie de la preuve.
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/../.." && pwd)"
compose_file="$script_dir/compose.yml"
project_name="transcendence_per"
compose=(docker compose -p "$project_name" -f "$compose_file")

# Traitement de sortie : conserve le statut d’échec et nettoie uniquement les ressources de cette campagne.
cleanup() {
  local status=$?
  trap - EXIT

  if (( status != 0 )); then
    "${compose[@]}" ps || true
    "${compose[@]}" logs --no-color --tail=160 db || true
  fi

  "${compose[@]}" down --volumes --remove-orphans
  exit "$status"
}

# Garantit que la sortie normale et les erreurs passent par le nettoyage prévu par ce runner.
trap cleanup EXIT

if [[ "$project_name" != "transcendence_per" ]]; then
  echo "Refusing to run with an unexpected Compose project name" >&2
  exit 1
fi

# Exécute les contrôles d’administration avec le compte de la seule base PER isolée.
admin_psql() {
  "${compose[@]}" exec -T db psql \
    --username per_admin \
    --dbname transcendence_per \
    --set ON_ERROR_STOP=1 \
    "$@"
}

# Exécute le fichier SQL avec le rôle runtime fourni pour prouver ses droits réels.
runtime_psql() {
  local role=$1
  local password=$2
  local file=$3

  "${compose[@]}" exec -T \
    --env "PGPASSWORD=$password" \
    db psql \
      --host 127.0.0.1 \
      --username "$role" \
      --dbname transcendence_per \
      --set ON_ERROR_STOP=1 \
      --file /dev/stdin < "$file"
}

# Exige le refus SQL attendu pour ce rôle ; une opération autorisée par erreur fait échouer la campagne.
expect_sql_failure() {
  local role=$1
  local password=$2
  local sql=$3
  local expected_pattern=$4
  local output

  if output=$("${compose[@]}" exec -T \
      --env "PGPASSWORD=$password" \
      db psql \
        --host 127.0.0.1 \
        --username "$role" \
        --dbname transcendence_per \
        --set ON_ERROR_STOP=1 \
        --command "$sql" 2>&1); then
    echo "Expected SQL to fail for $role: $sql" >&2
    exit 1
  fi

  if [[ "$output" != *"$expected_pattern"* ]]; then
    echo "$output" >&2
    echo "Failure for $role did not contain: $expected_pattern" >&2
    exit 1
  fi
}

cd "$repo_dir"

"${compose[@]}" down --volumes --remove-orphans
"${compose[@]}" config --quiet
"${compose[@]}" build \
  migrate-auth migrate-users migrate-catalog \
  migrate-media migrate-library migrate-playback migrate-chat
"${compose[@]}" up -d --wait db

echo "[PER] Applying the seven Prisma baselines with their migration owners"
for service in auth users catalog media library playback chat; do
  "${compose[@]}" run --rm "migrate-$service"
done

echo "[PER] Reapplying ownership and least-privilege grants"
admin_psql --file /permissions/assign-owners.sql
admin_psql --file /permissions/apply-grants.sql
admin_psql --file /dev/stdin < "$script_dir/assert-state.sql"

echo "[PER] Proving allowed DML for every runtime role"
runtime_psql auth_runtime per_auth_runtime_test_only "$script_dir/auth-runtime.sql"
runtime_psql users_runtime per_users_runtime_test_only "$script_dir/users-runtime.sql"
runtime_psql catalog_runtime per_catalog_runtime_test_only "$script_dir/catalog-runtime.sql"
runtime_psql media_runtime per_media_runtime_test_only "$script_dir/media-runtime.sql"
runtime_psql library_runtime per_library_runtime_test_only "$script_dir/library-runtime.sql"
runtime_psql playback_runtime per_playback_runtime_test_only "$script_dir/playback-runtime.sql"
runtime_psql chat_runtime per_chat_runtime_test_only "$script_dir/chat-runtime.sql"

echo "[PER] Proving forbidden cross-service and DDL operations"
expect_sql_failure \
  auth_runtime per_auth_runtime_test_only \
  'SELECT * FROM users.profiles' \
  'permission denied'
expect_sql_failure \
  catalog_runtime per_catalog_runtime_test_only \
  'SELECT * FROM media.assets' \
  'permission denied'
expect_sql_failure \
  auth_runtime per_auth_runtime_test_only \
  'DELETE FROM auth.accounts' \
  'permission denied'
expect_sql_failure \
  auth_runtime per_auth_runtime_test_only \
  'CREATE TABLE auth.forbidden_runtime_ddl (id integer)' \
  'permission denied'
expect_sql_failure \
  auth_migration per_auth_migration_test_only \
  'CREATE TABLE users.forbidden_cross_owner (id integer)' \
  'permission denied'
expect_sql_failure \
  chat_runtime per_chat_runtime_test_only \
  'SELECT * FROM library.playlists' \
  'permission denied'
expect_sql_failure \
  chat_runtime per_chat_runtime_test_only \
  'DELETE FROM chat.messages' \
  'permission denied'

echo "[PER] Proving representative database constraints"
expect_sql_failure \
  users_runtime per_users_runtime_test_only \
  "INSERT INTO users.profiles (user_id, username, display_name) VALUES ('70000000-0000-4000-8000-000000000001', 'Invalid-Name', 'Invalid')" \
  'profiles_username_canonical_check'
expect_sql_failure \
  media_runtime per_media_runtime_test_only \
  "INSERT INTO media.assets (storage_key, purpose, state, mime_type, byte_size) VALUES ('invalid-ready-audio', 'audio', 'ready', 'audio/mpeg', 1)" \
  'assets_ready_audio_duration_check'
expect_sql_failure \
  catalog_runtime per_catalog_runtime_test_only \
  "INSERT INTO catalog.tracks (title, status) VALUES ('Invalid published track', 'published')" \
  'tracks_published_fields_check'
expect_sql_failure \
  media_runtime per_media_runtime_test_only \
  "INSERT INTO media.variants (asset_id, rendition_key, storage_key, mime_type, byte_size) VALUES ('70000000-0000-4000-8000-000000000002', 'invalid', 'invalid-variant', 'audio/mpeg', 1)" \
  'variants_asset_fkey'

expect_sql_failure \
  chat_runtime per_chat_runtime_test_only \
  "INSERT INTO chat.conversations (user_a_id, user_b_id) VALUES ('60000000-0000-4000-8000-0000000000b2', '60000000-0000-4000-8000-0000000000a1')" \
  'conversations_pair_order_check'
expect_sql_failure \
  chat_runtime per_chat_runtime_test_only \
  "WITH c AS (INSERT INTO chat.conversations (user_a_id, user_b_id) VALUES ('60000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-0000000000b2') RETURNING id) INSERT INTO chat.messages (conversation_id, sender_user_id, body) SELECT id, '60000000-0000-4000-8000-0000000000a1', '   ' FROM c" \
  'messages_body_check'

echo "[PER] Proving runtime Prisma connections"
"${compose[@]}" run --rm \
  --env AUTH_DATABASE_URL=postgresql://auth_runtime:per_auth_runtime_test_only@db:5432/transcendence_per?schema=auth \
  migrate-auth npm run prisma:smoke
"${compose[@]}" run --rm \
  --env USER_DATABASE_URL=postgresql://users_runtime:per_users_runtime_test_only@db:5432/transcendence_per?schema=users \
  migrate-users npm run prisma:smoke
"${compose[@]}" run --rm \
  --env CATALOG_DATABASE_URL=postgresql://catalog_runtime:per_catalog_runtime_test_only@db:5432/transcendence_per?schema=catalog \
  migrate-catalog npm run prisma:smoke
"${compose[@]}" run --rm \
  --env MEDIA_DATABASE_URL=postgresql://media_runtime:per_media_runtime_test_only@db:5432/transcendence_per?schema=media \
  migrate-media npm run prisma:smoke
"${compose[@]}" run --rm \
  --env LIBRARY_DATABASE_URL=postgresql://library_runtime:per_library_runtime_test_only@db:5432/transcendence_per?schema=library \
  migrate-library npm run prisma:smoke
"${compose[@]}" run --rm \
  --env PLAYBACK_DATABASE_URL=postgresql://playback_runtime:per_playback_runtime_test_only@db:5432/transcendence_per?schema=playback \
  migrate-playback npm run prisma:smoke
"${compose[@]}" run --rm \
  --env CHAT_DATABASE_URL=postgresql://chat_runtime:per_chat_runtime_test_only@db:5432/transcendence_per?schema=chat \
  migrate-chat npm run prisma:smoke

echo "[PER] Replaying migrations to prove a stable no-op"
for service in auth users catalog media library playback chat; do
  "${compose[@]}" run --rm "migrate-$service"
done

admin_psql --file /dev/stdin < "$script_dir/assert-state.sql"

echo "[PER] PASS: seven schemas, 14 roles, ownership, cardinalities, constraints and permission boundaries"
