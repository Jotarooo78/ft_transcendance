\set ON_ERROR_STOP on
-- Reserved edge fixtures only, in the disposable transcendence_music database.
SELECT current_database() = 'transcendence_music' AS correct_database \gset
\if :correct_database
BEGIN;
\if :cleanup
DELETE FROM catalog.tracks WHERE id IN ('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002');
DELETE FROM catalog.artists WHERE id IN ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002');
DELETE FROM catalog.genres WHERE id='11000000-0000-4000-8000-000000000003';
\else
INSERT INTO catalog.artists(id,name,slug) VALUES
('11000000-0000-4000-8000-000000000001','Zzz Demo','zzz-demo'),
('11000000-0000-4000-8000-000000000002','Aaa Demo','aaa-demo');
INSERT INTO catalog.genres(id,name) VALUES ('11000000-0000-4000-8000-000000000003','Other');
INSERT INTO catalog.tracks(id,title,audio_asset_id,duration_ms,status,published_at) VALUES
('21000000-0000-4000-8000-000000000001','Aube — demo','31000000-0000-4000-8000-000000000001',9000,'published',now()),
('21000000-0000-4000-8000-000000000002','Zed 100%_demo','31000000-0000-4000-8000-000000000002',1000,'published',now());
INSERT INTO catalog.track_artists(track_id,artist_id,role,credit_order) VALUES
('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','primary',1),
('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','primary',1);
INSERT INTO catalog.track_genres(track_id,genre_id) VALUES
('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003'),
('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003');
\endif
COMMIT;
\else
DO $$ BEGIN RAISE EXCEPTION 'Edge fixtures require transcendence_music'; END $$;
\endif
