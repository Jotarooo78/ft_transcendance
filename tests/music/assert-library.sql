\set ON_ERROR_STOP on
SELECT set_config('music.library_fixture', :'fixture', false) IS NOT NULL AS fixture_loaded;
SELECT set_config('music.library_cleanup', :'cleanup', false) IS NOT NULL AS cleanup_loaded;
DO $$
DECLARE
  f jsonb := current_setting('music.library_fixture')::jsonb;
  expected jsonb;
  actual jsonb;
  owner_id uuid;
BEGIN
  IF current_database() <> 'transcendence_music' THEN RAISE EXCEPTION 'Wrong test database'; END IF;
  FOR expected, owner_id IN SELECT f->'p', (f->'a'->>'id')::uuid UNION ALL SELECT f->'pb', (f->'b'->>'id')::uuid LOOP
    IF current_setting('music.library_cleanup') = 'true' THEN
      IF EXISTS (SELECT 1 FROM library.playlists WHERE id=(expected->>'id')::uuid)
        OR EXISTS (SELECT 1 FROM library.playlist_items WHERE playlist_id=(expected->>'id')::uuid)
      THEN RAISE EXCEPTION 'Cleanup did not cascade'; END IF;
    ELSE
      SELECT jsonb_build_object('id', p.id, 'name', p.name, 'description', coalesce(p.description,''), 'version', p.version,
        'items', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'trackId', i.track_id, 'position', i.position) ORDER BY i.position)
          FROM library.playlist_items i WHERE i.playlist_id=p.id), '[]'::jsonb)) INTO actual
      FROM library.playlists p WHERE p.id=(expected->>'id')::uuid AND p.owner_user_id=owner_id AND p.visibility='private';
      IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SQL playlist differs from HTTP evidence'; END IF;
      IF EXISTS (SELECT 1 FROM library.playlist_items WHERE playlist_id=(expected->>'id')::uuid
        AND (position<=0 OR added_by_user_id IS DISTINCT FROM owner_id))
      THEN RAISE EXCEPTION 'Invalid occurrence ownership or position'; END IF;
      IF EXISTS (SELECT position FROM library.playlist_items WHERE playlist_id=(expected->>'id')::uuid GROUP BY position HAVING count(*)>1)
      THEN RAISE EXCEPTION 'Duplicate positions'; END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM library.playlists WHERE id IN ((f->'deleted'->>'id')::uuid, (f->>'boundaryId')::uuid))
    OR EXISTS (SELECT 1 FROM library.playlist_items WHERE playlist_id=(f->'deleted'->>'id')::uuid OR id=(f->>'removed')::uuid)
  THEN RAISE EXCEPTION 'Removed playlist or occurrence still present'; END IF;
  IF NOT EXISTS (SELECT 1 FROM catalog.tracks WHERE id='20000000-0000-4000-8000-000000000003' AND status='published')
    OR NOT EXISTS (SELECT 1 FROM media.assets WHERE id='30000000-0000-4000-8000-000000000003' AND state='ready')
  THEN RAISE EXCEPTION 'Deletion affected shared catalogue or media'; END IF;
END $$;
SELECT 'PASS Library SQL owners, versions, occurrences and cascades' AS result;
