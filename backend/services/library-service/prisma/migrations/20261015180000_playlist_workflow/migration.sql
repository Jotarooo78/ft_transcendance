-- Ajoute la pochette sans modifier les playlists existantes ; conserve les reçus avec leur propriétaire.
ALTER TABLE library.playlists ADD COLUMN cover_asset_id UUID;
CREATE TABLE library.playlist_changes (
  id UUID PRIMARY KEY,
  playlist_id UUID NOT NULL REFERENCES library.playlists(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  undo JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX playlist_changes_playlist_id_idx ON library.playlist_changes(playlist_id);
