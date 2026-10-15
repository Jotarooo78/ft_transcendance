-- Seuls les nouveaux uploads provisoires expirent ; une réservation bloque leur suppression.
ALTER TABLE media.assets ADD COLUMN expires_at TIMESTAMPTZ;
ALTER TABLE media.assets ADD COLUMN publication_track_id UUID;
CREATE INDEX assets_expiration_idx ON media.assets(expires_at)
  WHERE state = 'ready' AND publication_track_id IS NULL;
