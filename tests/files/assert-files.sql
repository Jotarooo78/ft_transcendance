-- Preuve SQL de les métadonnées, UUID et contraintes du fichier demandé. Une assertion échouée arrête psql ; les fixtures ne doivent être exécutées que dans leur cible de test contrôlée.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'transcendence_music' THEN RAISE EXCEPTION 'Wrong database for file proof'; END IF;
END $$;
SELECT EXISTS (
  SELECT 1 FROM media.assets
  WHERE id = :'asset_id'::uuid AND uploader_user_id = :'owner_id'::uuid
    AND purpose = :'purpose' AND state = :'state'
    AND byte_size = :'bytes'::bigint AND checksum_sha256 = :'checksum'
    AND (CASE WHEN purpose = 'audio' THEN duration_ms = :'duration'::bigint ELSE duration_ms IS NULL END)
) AS file_valid \gset
\if :file_valid
  \echo FILE_SQL_PASS
\else
  \echo FILE_SQL_FAIL
  \quit 1
\endif
