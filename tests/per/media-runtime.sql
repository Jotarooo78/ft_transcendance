-- Preuve SQL de les données et refus propres au scénario décrit dans le README voisin. Une assertion échouée arrête psql ; les fixtures ne doivent être exécutées que dans leur cible de test contrôlée.
\set ON_ERROR_STOP on
-- Encadre les écritures de fixture pour que le scénario puisse les valider ou les annuler explicitement.
BEGIN;

INSERT INTO media.assets (
  id, uploader_user_id, purpose, state, storage_key, mime_type, byte_size, duration_ms
) VALUES (
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000099',
  'audio',
  'ready',
  'per/audio/original',
  'audio/mpeg',
  1024,
  180000
);

INSERT INTO media.variants (
  id, asset_id, rendition_key, storage_key, mime_type, bitrate_kbps, byte_size
) VALUES (
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  'mp3-192',
  'per/audio/mp3-192',
  'audio/mpeg',
  192,
  512
);

UPDATE media.assets
SET checksum_sha256 = 'per-checksum'
WHERE id = '40000000-0000-4000-8000-000000000001';

DELETE FROM media.variants
WHERE id = '40000000-0000-4000-8000-000000000002';

-- Retire les écritures d’essai de cette transaction après les assertions.
ROLLBACK;
