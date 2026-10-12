\set ON_ERROR_STOP on
SELECT current_database() = 'transcendence_music' AS correct_database \gset
\if :correct_database
BEGIN;
\if :cleanup
DELETE FROM catalog.tracks WHERE id IN ('22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000003');
DELETE FROM media.assets WHERE id IN ('32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000003');
\else
INSERT INTO media.assets(id,purpose,state,storage_key,mime_type,byte_size,duration_ms) VALUES
('32000000-0000-4000-8000-000000000001','audio','pending','edge-pending.wav','audio/wav',96044,6000),
('32000000-0000-4000-8000-000000000002','audio','ready','edge-private.wav','audio/wav',96044,6000),
('32000000-0000-4000-8000-000000000003','audio','ready','edge-missing.wav','audio/wav',96044,6000);
INSERT INTO catalog.tracks(id,title,audio_asset_id,duration_ms,status,published_at) VALUES
('22000000-0000-4000-8000-000000000001','Pending media fixture','32000000-0000-4000-8000-000000000001',6000,'published',now()),
('22000000-0000-4000-8000-000000000002','Withdrawn media fixture','32000000-0000-4000-8000-000000000002',6000,'withdrawn',now()),
('22000000-0000-4000-8000-000000000003','Missing file fixture','32000000-0000-4000-8000-000000000003',6000,'published',now());
\endif
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'Media fixtures require transcendence_music'; END $$;
\endif
