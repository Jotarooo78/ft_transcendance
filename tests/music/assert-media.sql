\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database() <> 'transcendence_music' THEN RAISE EXCEPTION 'Wrong test database'; END IF;
  IF (SELECT count(*) FROM media.assets WHERE id IN (
    '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003') AND purpose='audio' AND state='ready'
    AND mime_type='audio/wav' AND byte_size=96044 AND duration_ms=6000
    AND checksum_sha256 ~ '^[a-f0-9]{64}$'
    AND storage_key='demo-' || right(id::text, 1) || '.wav') <> 3
  THEN RAISE EXCEPTION 'Incoherent demo media'; END IF;
  IF (SELECT count(DISTINCT checksum_sha256) FROM media.assets WHERE id IN (
    '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003')) <> 3
  THEN RAISE EXCEPTION 'Expected three different tones'; END IF;
END $$;
