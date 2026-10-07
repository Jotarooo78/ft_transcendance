\set ON_ERROR_STOP on
-- Exact constants reserved to the isolated PCE API account; no interpolated SQL.
DO $$
DECLARE
  account_id uuid;
  profile_id uuid;
  event_id uuid;
BEGIN
  SELECT id INTO STRICT account_id FROM auth.accounts
    WHERE email = 'pce_api@example.invalid' AND state = 'active';
  SELECT user_id INTO STRICT profile_id FROM users.profiles
    WHERE user_id = account_id AND username = 'pce_updated'
      AND display_name = 'PCE confirmed' AND bio = 'Persisted PCE biography'
      AND avatar_url LIKE '/api/users/avatars/' || account_id::text || '-%.png';
  IF account_id <> profile_id THEN RAISE EXCEPTION 'Auth/Users identity differs'; END IF;
  SELECT id INTO STRICT event_id FROM auth.outbox_messages
    WHERE aggregate_id = account_id AND status = 'delivered' AND delivered_at IS NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM users.inbox_messages
    WHERE id = event_id AND aggregate_id = account_id AND type = 'ProfileProvisionRequested.v1') THEN
    RAISE EXCEPTION 'Matching Users inbox message missing';
  END IF;
END $$;
\echo '[PCE SQL] PASS active account, stable UUID, canonical profile, avatar, outbox and inbox'
