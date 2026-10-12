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
  IF EXISTS (SELECT 1 FROM media.assets a JOIN (VALUES
    ('30000000-0000-4000-8000-000000000001'::uuid,'5677a050f387c21a475ab48574c58b694f895a4a892e6856e25ef89e8e4d6acb'),
    ('30000000-0000-4000-8000-000000000002'::uuid,'2555a613adb120e97254d51e67841193f7481d5058450ef9e77b86d6088b5323'),
    ('30000000-0000-4000-8000-000000000003'::uuid,'fd61a1cf5debdd360c057b20aaf36618ba6cced33536326ddf540e69bef0a882')
  ) expected(id,checksum) USING(id) WHERE a.checksum_sha256 IS DISTINCT FROM expected.checksum)
  THEN RAISE EXCEPTION 'Demo checksum changed'; END IF;
END $$;
