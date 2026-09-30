\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.accounts (id, email, password_hash)
VALUES ('10000000-0000-4000-8000-000000000001', 'per-auth@example.test', 'hash');

INSERT INTO auth.outbox_messages (
  id, type, aggregate_id, aggregate_version, payload
) VALUES (
  '10000000-0000-4000-8000-000000000002',
  'profile.provision.requested',
  '10000000-0000-4000-8000-000000000001',
  1,
  '{"displayName":"PER Auth","username":"per_auth"}'::jsonb
);

UPDATE auth.accounts
SET state = 'active'
WHERE id = '10000000-0000-4000-8000-000000000001';

SELECT id, state FROM auth.accounts
WHERE id = '10000000-0000-4000-8000-000000000001';

ROLLBACK;
