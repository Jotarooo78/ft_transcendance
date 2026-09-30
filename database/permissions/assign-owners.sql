\set ON_ERROR_STOP on

ALTER SCHEMA auth OWNER TO auth_migration;
ALTER TABLE auth._prisma_migrations OWNER TO auth_migration;
ALTER TABLE auth.accounts OWNER TO auth_migration;
ALTER TABLE auth.outbox_messages OWNER TO auth_migration;

ALTER SCHEMA users OWNER TO users_migration;
ALTER TABLE users._prisma_migrations OWNER TO users_migration;
ALTER TABLE users.profiles OWNER TO users_migration;
ALTER TABLE users.inbox_messages OWNER TO users_migration;
ALTER TABLE users.friends OWNER TO users_migration;
ALTER TABLE users.presences OWNER TO users_migration;

ALTER SCHEMA catalog OWNER TO catalog_migration;
ALTER TABLE catalog._prisma_migrations OWNER TO catalog_migration;
ALTER TABLE catalog.artists OWNER TO catalog_migration;
ALTER TABLE catalog.artist_members OWNER TO catalog_migration;
ALTER TABLE catalog.tracks OWNER TO catalog_migration;
ALTER TABLE catalog.track_artists OWNER TO catalog_migration;
ALTER TABLE catalog.releases OWNER TO catalog_migration;
ALTER TABLE catalog.release_artists OWNER TO catalog_migration;
ALTER TABLE catalog.release_tracks OWNER TO catalog_migration;
ALTER TABLE catalog.genres OWNER TO catalog_migration;
ALTER TABLE catalog.track_genres OWNER TO catalog_migration;

ALTER SCHEMA media OWNER TO media_migration;
ALTER TABLE media._prisma_migrations OWNER TO media_migration;
ALTER TABLE media.assets OWNER TO media_migration;
ALTER TABLE media.variants OWNER TO media_migration;

ALTER SCHEMA library OWNER TO library_migration;
ALTER TABLE library._prisma_migrations OWNER TO library_migration;
ALTER TABLE library.playlists OWNER TO library_migration;
ALTER TABLE library.playlist_items OWNER TO library_migration;
ALTER TABLE library.track_favorites OWNER TO library_migration;

ALTER SCHEMA playback OWNER TO playback_migration;
ALTER TABLE playback._prisma_migrations OWNER TO playback_migration;
ALTER TABLE playback.sessions OWNER TO playback_migration;
ALTER TABLE playback.events OWNER TO playback_migration;
