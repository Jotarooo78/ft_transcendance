\set ON_ERROR_STOP on
BEGIN;

INSERT INTO catalog.artists (id, name, slug, image_asset_id)
VALUES (
  '30000000-0000-4000-8000-000000000001',
  'PER Artist',
  'per-artist',
  '30000000-0000-4000-8000-000000000099'
);

INSERT INTO catalog.artist_members (artist_id, user_id, role)
VALUES (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000098',
  'owner'
);

INSERT INTO catalog.tracks (
  id, title, audio_asset_id, duration_ms, status, published_at, created_by_user_id
) VALUES (
  '30000000-0000-4000-8000-000000000002',
  'PER Track',
  '30000000-0000-4000-8000-000000000097',
  180000,
  'published',
  CURRENT_TIMESTAMP,
  '30000000-0000-4000-8000-000000000098'
);

INSERT INTO catalog.track_artists (track_id, artist_id, role, credit_order)
VALUES (
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'primary',
  1
);

INSERT INTO catalog.releases (
  id, title, release_type, release_date, status
) VALUES (
  '30000000-0000-4000-8000-000000000003',
  'PER Release',
  'single',
  CURRENT_DATE,
  'published'
);

INSERT INTO catalog.release_artists (release_id, artist_id, credit_order)
VALUES (
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  1
);

INSERT INTO catalog.release_tracks (
  id, release_id, track_id, disc_number, track_number
) VALUES (
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000002',
  1,
  1
);

INSERT INTO catalog.genres (id, name)
VALUES ('30000000-0000-4000-8000-000000000005', 'PER Genre');

INSERT INTO catalog.track_genres (track_id, genre_id)
VALUES (
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000005'
);

UPDATE catalog.tracks
SET version = version + 1
WHERE id = '30000000-0000-4000-8000-000000000002';

DELETE FROM catalog.track_genres
WHERE track_id = '30000000-0000-4000-8000-000000000002'
  AND genre_id = '30000000-0000-4000-8000-000000000005';

ROLLBACK;
