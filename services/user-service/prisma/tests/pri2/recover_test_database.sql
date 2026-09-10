-- Recovery is intentionally restricted to dedicated PRI-2 test databases.
-- It restores the legacy-only state because public.users is never deleted.
DO $guard$
BEGIN
    IF current_database() !~ '^transcendence_pri2_test_' THEN
        RAISE EXCEPTION
            'Refusing PRI-2 recovery outside a transcendence_pri2_test_* database';
    END IF;
END
$guard$;

BEGIN;

DROP TABLE IF EXISTS "auth"."accounts";
DROP TABLE IF EXISTS "users"."profiles";
DROP SCHEMA IF EXISTS "auth";
DROP SCHEMA IF EXISTS "users";

-- This table/row exists only when the test used `prisma migrate deploy`.
DO $migration_history$
BEGIN
    IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
        DELETE FROM "public"."_prisma_migrations"
        WHERE "migration_name" =
            '20260910140000_split_auth_accounts_and_user_profiles';
    END IF;
END
$migration_history$;

COMMIT;

SELECT COUNT(*) AS preserved_legacy_rows
FROM "public"."users";
