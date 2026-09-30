\set ON_ERROR_STOP on
BEGIN;

INSERT INTO users.profiles (user_id, username, display_name, bio)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'per_user_one', 'PER User One', NULL),
  ('20000000-0000-4000-8000-000000000002', 'per_user_two', 'PER User Two', 'Bio');

INSERT INTO users.inbox_messages (
  id, type, aggregate_id, aggregate_version, result
) VALUES (
  '20000000-0000-4000-8000-000000000003',
  'profile.provision.requested',
  '20000000-0000-4000-8000-000000000001',
  1,
  '{"status":"created"}'::jsonb
);

INSERT INTO users.friends (user_id, friend_id)
VALUES
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001');

INSERT INTO users.presences (user_id, is_online)
VALUES ('20000000-0000-4000-8000-000000000001', true);

UPDATE users.presences
SET last_seen_at = CURRENT_TIMESTAMP
WHERE user_id = '20000000-0000-4000-8000-000000000001';

DELETE FROM users.friends
WHERE user_id = '20000000-0000-4000-8000-000000000002'
  AND friend_id = '20000000-0000-4000-8000-000000000001';

SELECT user_id, username, bio FROM users.profiles ORDER BY username;

ROLLBACK;
