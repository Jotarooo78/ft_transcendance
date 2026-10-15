ALTER TABLE catalog.releases ADD COLUMN published_at TIMESTAMPTZ(6);
-- Les sorties existantes conservent la meilleure date historique disponible.
UPDATE catalog.releases r SET published_at = COALESCE(
  (SELECT min(t.published_at) FROM catalog.release_tracks rt JOIN catalog.tracks t ON t.id=rt.track_id WHERE rt.release_id=r.id),
  r.release_date::timestamptz, r.created_at
) WHERE r.status='published';
CREATE INDEX releases_recent_idx ON catalog.releases(status, published_at DESC, id);
