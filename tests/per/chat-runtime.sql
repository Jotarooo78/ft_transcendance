-- Preuve SQL de les données et refus propres au scénario décrit dans le README voisin. Une assertion échouée arrête psql ; les fixtures ne doivent être exécutées que dans leur cible de test contrôlée.
\set ON_ERROR_STOP on
-- Encadre les écritures de fixture pour que le scénario puisse les valider ou les annuler explicitement.
BEGIN;

INSERT INTO chat.conversations (id, user_a_id, user_b_id)
VALUES (
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-0000000000a1',
  '60000000-0000-4000-8000-0000000000b2'
);

-- L'identifiant du message est un compteur automatique : cet INSERT prouve que le rôle runtime a le
-- droit de s'en servir (sinon : « permission denied for sequence »).
INSERT INTO chat.messages (conversation_id, sender_user_id, body)
VALUES
  (
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-0000000000a1',
    'first'
  ),
  (
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-0000000000b2',
    'second'
  );

UPDATE chat.conversations
SET last_message_at = CURRENT_TIMESTAMP,
    last_read_a_message_id = (SELECT max(id) FROM chat.messages)
WHERE id = '60000000-0000-4000-8000-000000000001';

UPDATE chat.messages
SET deleted_at = CURRENT_TIMESTAMP
WHERE conversation_id = '60000000-0000-4000-8000-000000000001'
  AND body = 'first';

-- Retire les écritures d’essai de cette transaction après les assertions.
ROLLBACK;
