BEGIN;

INSERT INTO "users"."profiles" ("user_id", "username", "display_name")
VALUES (
    '11111111-1111-4111-8111-111111111111',
    'pri5_unique_username',
    'PRI-5 first profile'
);

DO $test$
BEGIN
    BEGIN
        INSERT INTO "users"."profiles" ("user_id", "username", "display_name")
        VALUES (
            '22222222-2222-4222-8222-222222222222',
            'pri5_unique_username',
            'PRI-5 conflicting profile'
        );

        RAISE EXCEPTION 'PRI-5 expected a unique_violation for duplicate username';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'PRI-5 duplicate username correctly rejected';
    END;
END
$test$;

ROLLBACK;
