-- Réservation séparée de celle des audios ; les fichiers existants restent inchangés.
ALTER TABLE media.assets ADD COLUMN playlist_id UUID;
CREATE INDEX assets_playlist_id_idx ON media.assets(playlist_id);
