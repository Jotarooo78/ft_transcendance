\set ON_ERROR_STOP on
DO $$
DECLARE fixture_count integer;
BEGIN
  SELECT count(*) INTO fixture_count FROM catalog.tracks
  WHERE id IN ('20000000-0000-4000-8000-000000000001',
               '20000000-0000-4000-8000-000000000002',
               '20000000-0000-4000-8000-000000000003')
    AND status = 'published' AND duration_ms = 6000
    AND published_at = '2026-01-01T00:00:00Z'
    AND audio_asset_id::text = '30000000' || substring(id::text from 9)
    AND title = CASE right(id::text, 1)
      WHEN '1' THEN 'Aube — demo' WHEN '2' THEN 'Brise — demo' ELSE 'Clair — demo' END;
  IF fixture_count <> 3 THEN RAISE EXCEPTION 'Catalogue published fixtures mismatch'; END IF;
  IF (SELECT count(*) FROM catalog.tracks WHERE id::text LIKE '20000000-0000-4000-8000-0000000000%') <> 4
  THEN RAISE EXCEPTION 'Unexpected count in reserved demo identities'; END IF;
  IF NOT EXISTS (SELECT 1 FROM catalog.tracks WHERE id = '20000000-0000-4000-8000-000000000099'
    AND status = 'draft' AND audio_asset_id IS NULL AND duration_ms IS NULL)
  THEN RAISE EXCEPTION 'Invisible draft fixture missing'; END IF;
  IF (SELECT count(*) FROM catalog.track_artists c JOIN catalog.artists a ON a.id=c.artist_id
      WHERE c.track_id IN ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003')
        AND a.id='10000000-0000-4000-8000-000000000001' AND a.name='Atelier Demo'
        AND a.slug='atelier-demo' AND c.role='primary' AND c.credit_order=1) <> 3
  THEN RAISE EXCEPTION 'Demo credits mismatch'; END IF;
  IF (SELECT count(*) FROM catalog.track_genres t JOIN catalog.genres g ON g.id=t.genre_id
      WHERE t.track_id IN ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003')
        AND g.id='10000000-0000-4000-8000-000000000002' AND g.name='Demo') <> 3
  THEN RAISE EXCEPTION 'Demo genres mismatch'; END IF;
END $$;
SELECT 'PASS catalogue fixtures and relations' AS result;
