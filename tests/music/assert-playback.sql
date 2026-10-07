\set ON_ERROR_STOP on
SELECT set_config('music.playback_fixture', :'fixture', false) IS NOT NULL AS fixture_loaded;
DO $$
DECLARE
  f jsonb := current_setting('music.playback_fixture')::jsonb;
  expected jsonb;
  actual jsonb;
  s playback.sessions%ROWTYPE;
  e playback.events%ROWTYPE;
  total_credit bigint;
  declared_before bigint;
  previous_ms bigint;
  started_ms bigint;
  received_ms bigint;
BEGIN
  IF current_database() <> 'transcendence_music' THEN RAISE EXCEPTION 'Wrong test database'; END IF;
  IF (SELECT count(*) FROM playback.sessions WHERE user_id=(f->'a'->>'id')::uuid) <> 2
    OR EXISTS (SELECT 1 FROM playback.sessions WHERE user_id=(f->'b'->>'id')::uuid)
  THEN RAISE EXCEPTION 'Unexpected sessions for fixture accounts'; END IF;
  FOR expected IN SELECT value FROM jsonb_array_elements(f->'sessions') LOOP
    SELECT * INTO STRICT s FROM playback.sessions WHERE id=(expected->>'id')::uuid;
    IF s.user_id IS DISTINCT FROM (f->'a'->>'id')::uuid OR s.qualified OR s.counting_rule_version <> 1
      OR s.track_id <> (expected->>'trackId')::uuid OR s.track_duration_ms <> (expected->>'trackDurationMs')::bigint
      OR s.listened_ms <> (expected->>'listenedMs')::bigint OR s.last_sequence <> (expected->>'lastSequence')::int
      OR date_trunc('milliseconds',s.started_at) <> (expected->>'startedAt')::timestamptz
      OR date_trunc('milliseconds',s.ended_at) IS DISTINCT FROM (expected->>'endedAt')::timestamptz
    THEN RAISE EXCEPTION 'Session SQL differs from HTTP facts'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('sequence',sequence,'positionMs',position_ms,
      'listenedMsTotal',listened_ms_total) ORDER BY sequence),'[]'::jsonb) INTO actual
      FROM playback.events WHERE session_id=s.id;
    IF actual IS DISTINCT FROM f->'events'->s.id::text OR jsonb_array_length(actual) <> s.last_sequence
    THEN RAISE EXCEPTION 'Unexpected, missing or duplicated event'; END IF;
    IF (SELECT position_ms FROM playback.events WHERE session_id=s.id AND sequence=s.last_sequence)
      IS DISTINCT FROM (expected->>'positionMs')::bigint THEN RAISE EXCEPTION 'Wrong last position'; END IF;
    -- Recompute the production contract independently from stored receipt times.
    total_credit := 0; declared_before := 0;
    started_ms := floor(extract(epoch FROM s.started_at)*1000)::bigint; previous_ms := started_ms;
    FOR e IN SELECT * FROM playback.events WHERE session_id=s.id ORDER BY sequence LOOP
      received_ms := floor(extract(epoch FROM e.received_at)*1000)::bigint;
      IF e.listened_ms_total < declared_before OR e.position_ms < 0 OR e.position_ms > s.track_duration_ms
      THEN RAISE EXCEPTION 'Invalid declared progression'; END IF;
      total_credit := total_credit + least(e.listened_ms_total-declared_before,
        greatest(0,received_ms-previous_ms),greatest(0,received_ms-started_ms-total_credit),
        greatest(0,s.track_duration_ms-total_credit));
      declared_before := e.listened_ms_total; previous_ms := received_ms;
    END LOOP;
    IF total_credit <> s.listened_ms THEN RAISE EXCEPTION 'Credit differs from independent SQL calculation'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema IN ('auth','users','catalog','media','library')
    AND has_table_privilege('playback_runtime',quote_ident(table_schema)||'.'||quote_ident(table_name),'SELECT'))
  THEN RAISE EXCEPTION 'Playback can read another service schema'; END IF;
END $$;
SELECT 'PASS Playback SQL events, credit, ownership, qualification and schema isolation' AS result;
