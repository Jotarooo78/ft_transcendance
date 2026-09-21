DO $assertions$
BEGIN
    IF (SELECT COUNT(*) FROM public.users) <> 3
       OR (SELECT COUNT(*) FROM auth.accounts) <> 3
       OR (SELECT COUNT(*) FROM users.profiles) <> 3 THEN
        RAISE EXCEPTION 'PRI-6 legacy: expected three preserved rows in each table';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.accounts WHERE state <> 'active') THEN
        RAISE EXCEPTION 'PRI-6 legacy: migrated accounts must be active';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.outbox_messages)
       OR EXISTS (SELECT 1 FROM users.inbox_messages) THEN
        RAISE EXCEPTION 'PRI-6 legacy: migration invented provisioning messages';
    END IF;
END
$assertions$;

SELECT
    (SELECT COUNT(*) FROM public.users) AS legacy_count,
    (SELECT COUNT(*) FROM auth.accounts WHERE state = 'active') AS active_account_count,
    (SELECT COUNT(*) FROM users.profiles) AS profile_count;
