-- Preuve SQL de les données et refus propres au scénario décrit dans le README voisin. Une assertion échouée arrête psql ; les fixtures ne doivent être exécutées que dans leur cible de test contrôlée.
\set ON_ERROR_STOP on
-- Encadre les écritures de fixture pour que le scénario puisse les valider ou les annuler explicitement.
BEGIN;

INSERT INTO library.playlists (id, owner_user_id, name)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000099',
  'PER Playlist'
);

INSERT INTO library.playlist_items (
  id, playlist_id, track_id, position, added_by_user_id
) VALUES
  (
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000098',
    1,
    '50000000-0000-4000-8000-000000000099'
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000098',
    2,
    '50000000-0000-4000-8000-000000000099'
  );

INSERT INTO library.track_favorites (user_id, track_id)
VALUES (
  '50000000-0000-4000-8000-000000000099',
  '50000000-0000-4000-8000-000000000098'
);

UPDATE library.playlists
SET version = version + 1
WHERE id = '50000000-0000-4000-8000-000000000001';

DELETE FROM library.track_favorites
WHERE user_id = '50000000-0000-4000-8000-000000000099'
  AND track_id = '50000000-0000-4000-8000-000000000098';

-- La nouvelle table de références reste accessible au seul rôle Library.
INSERT INTO library.saved_items(user_id, kind, target_id)
VALUES ('50000000-0000-4000-8000-000000000099', 'project', '50000000-0000-4000-8000-000000000098');
UPDATE library.saved_items SET created_at=now() WHERE kind='project';
SELECT count(*) FROM library.saved_items;
DELETE FROM library.saved_items WHERE kind='project';

-- Retire les écritures d’essai de cette transaction après les assertions.
ROLLBACK;
