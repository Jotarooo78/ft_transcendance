-- Étend les sorties existantes sans changer leurs identifiants ni leurs pistes.
ALTER TABLE catalog.releases
  ADD COLUMN owner_user_id uuid,
  ADD COLUMN description text,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT releases_description_check CHECK (description IS NULL OR char_length(description) <= 5000),
  ADD CONSTRAINT releases_version_check CHECK (version > 0);

ALTER TABLE catalog.releases DROP CONSTRAINT releases_type_check;
ALTER TABLE catalog.releases ADD CONSTRAINT releases_type_check
  CHECK (release_type IN ('single', 'ep', 'album', 'mixtape', 'compilation'));

CREATE INDEX releases_owner_updated_idx ON catalog.releases(owner_user_id, updated_at DESC, id);
CREATE INDEX releases_published_date_idx ON catalog.releases(release_date DESC, id)
  WHERE status = 'published';
