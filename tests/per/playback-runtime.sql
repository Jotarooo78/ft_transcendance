\set ON_ERROR_STOP on
BEGIN;

INSERT INTO playback.sessions (
  id, user_id, track_id, track_duration_ms
) VALUES (
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000099',
  '60000000-0000-4000-8000-000000000098',
  180000
);

INSERT INTO playback.events (
  session_id, sequence, listened_ms_total, position_ms
) VALUES (
  '60000000-0000-4000-8000-000000000001',
  1,
  1000,
  1000
);

UPDATE playback.sessions
SET listened_ms = 1000, last_sequence = 1
WHERE id = '60000000-0000-4000-8000-000000000001';

DELETE FROM playback.events
WHERE session_id = '60000000-0000-4000-8000-000000000001'
  AND sequence = 1;

ROLLBACK;
