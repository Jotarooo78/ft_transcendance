DO $assertions$
DECLARE
    active_user_id UUID;
BEGIN
    SELECT id
      INTO active_user_id
      FROM auth.accounts
     WHERE email = 'pri6@example.invalid'
       AND state = 'active';

    IF active_user_id IS NULL THEN
        RAISE EXCEPTION 'PRI-6: active account was not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM users.profiles
         WHERE user_id = active_user_id
           AND username = 'pri6_user'
           AND display_name = 'PRI-6 User'
    ) THEN
        RAISE EXCEPTION 'PRI-6: matching profile was not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM auth.outbox_messages
         WHERE aggregate_id = active_user_id
           AND status = 'delivered'
    ) THEN
        RAISE EXCEPTION 'PRI-6: delivered outbox message was not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM users.inbox_messages
         WHERE aggregate_id = active_user_id
    ) THEN
        RAISE EXCEPTION 'PRI-6: processed inbox message was not found';
    END IF;

    IF (SELECT COUNT(*) FROM auth.accounts WHERE email = 'pri6@example.invalid') <> 1 THEN
        RAISE EXCEPTION 'PRI-6: duplicate-email test changed the account count';
    END IF;

    IF EXISTS (
        SELECT 1 FROM auth.accounts WHERE email IN (
            'missing@example.invalid',
            'unknown@example.invalid'
        )
    ) THEN
        RAISE EXCEPTION 'PRI-6: invalid or unknown request created an account';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM auth.accounts AS account
          JOIN auth.outbox_messages AS message
            ON message.aggregate_id = account.id
         WHERE account.email = 'pri6-duplicate-username@example.invalid'
           AND account.state = 'profile_failed'
           AND message.status = 'failed'
           AND message.last_error = 'USERNAME_TAKEN'
    ) THEN
        RAISE EXCEPTION 'PRI-6: duplicate username did not reach the expected failed state';
    END IF;

    IF (SELECT COUNT(*) FROM users.profiles WHERE username = 'pri6_user') <> 1 THEN
        RAISE EXCEPTION 'PRI-6: duplicate username created an extra profile';
    END IF;
END
$assertions$;

SELECT
    (SELECT COUNT(*) FROM auth.accounts) AS account_count,
    (SELECT COUNT(*) FROM users.profiles) AS profile_count,
    (SELECT COUNT(*) FROM auth.outbox_messages WHERE status = 'delivered') AS delivered_outbox_count,
    (SELECT COUNT(*) FROM auth.outbox_messages WHERE status = 'failed') AS failed_outbox_count,
    (SELECT COUNT(*) FROM users.inbox_messages) AS inbox_count;
