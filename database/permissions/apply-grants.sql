\set ON_ERROR_STOP on

BEGIN;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA auth, users, catalog, media, library, playback FROM PUBLIC;
REVOKE ALL ON SCHEMA auth, users, catalog, media, library, playback FROM
  auth_runtime, users_runtime, catalog_runtime,
  media_runtime, library_runtime, playback_runtime;

REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM auth_runtime, users_runtime, catalog_runtime, media_runtime, library_runtime, playback_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA users FROM auth_runtime, users_runtime, catalog_runtime, media_runtime, library_runtime, playback_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA catalog FROM auth_runtime, users_runtime, catalog_runtime, media_runtime, library_runtime, playback_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA media FROM auth_runtime, users_runtime, catalog_runtime, media_runtime, library_runtime, playback_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA library FROM auth_runtime, users_runtime, catalog_runtime, media_runtime, library_runtime, playback_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA playback FROM auth_runtime, users_runtime, catalog_runtime, media_runtime, library_runtime, playback_runtime;

GRANT USAGE ON SCHEMA auth TO auth_runtime;
GRANT USAGE ON SCHEMA users TO users_runtime;
GRANT USAGE ON SCHEMA catalog TO catalog_runtime;
GRANT USAGE ON SCHEMA media TO media_runtime;
GRANT USAGE ON SCHEMA library TO library_runtime;
GRANT USAGE ON SCHEMA playback TO playback_runtime;

GRANT SELECT, INSERT, UPDATE
  ON TABLE auth.accounts, auth.outbox_messages
  TO auth_runtime;

GRANT SELECT, INSERT, UPDATE
  ON TABLE users.profiles, users.presences
  TO users_runtime;
GRANT SELECT, INSERT
  ON TABLE users.inbox_messages
  TO users_runtime;
GRANT SELECT, INSERT, DELETE
  ON TABLE users.friends
  TO users_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE
    catalog.artists,
    catalog.artist_members,
    catalog.tracks,
    catalog.track_artists,
    catalog.releases,
    catalog.release_artists,
    catalog.release_tracks,
    catalog.genres,
    catalog.track_genres
  TO catalog_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE media.assets, media.variants
  TO media_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE library.playlists, library.playlist_items, library.track_favorites
  TO library_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE playback.sessions, playback.events
  TO playback_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE auth_migration IN SCHEMA auth REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE users_migration IN SCHEMA users REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE catalog_migration IN SCHEMA catalog REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE media_migration IN SCHEMA media REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE library_migration IN SCHEMA library REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE playback_migration IN SCHEMA playback REVOKE ALL ON TABLES FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE auth_migration IN SCHEMA auth REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE users_migration IN SCHEMA users REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE catalog_migration IN SCHEMA catalog REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE media_migration IN SCHEMA media REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE library_migration IN SCHEMA library REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE playback_migration IN SCHEMA playback REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
