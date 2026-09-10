-- Read-only inventory to run against a legacy database before PRI-2.
BEGIN TRANSACTION READ ONLY;

SELECT
    current_database() AS database_name,
    current_setting('server_version') AS postgres_version,
    current_setting('TimeZone') AS session_timezone,
    to_regclass('public.users') AS legacy_table,
    to_regclass('auth.accounts') AS account_target,
    to_regclass('users.profiles') AS profile_target;

SELECT COUNT(*) AS legacy_rows
FROM "public"."users";

SELECT COUNT(*) AS null_usernames_blocking
FROM "public"."users"
WHERE "username" IS NULL;

SELECT COUNT(*) AS null_display_names_using_username_fallback
FROM "public"."users"
WHERE "displayName" IS NULL;

-- Exact duplicates would conflict with the retained target constraints.
SELECT "email", COUNT(*) AS occurrences
FROM "public"."users"
GROUP BY "email"
HAVING COUNT(*) > 1;

SELECT "username", COUNT(*) AS occurrences
FROM "public"."users"
GROUP BY "username"
HAVING COUNT(*) > 1;

-- Case-folded collisions are informational only: PRI-2 preserves case and does
-- not normalize these fields. They must be reconsidered if that policy changes.
SELECT lower("email") AS normalized_email, COUNT(*) AS occurrences
FROM "public"."users"
GROUP BY lower("email")
HAVING COUNT(*) > 1;

SELECT lower("username") AS normalized_username, COUNT(*) AS occurrences
FROM "public"."users"
GROUP BY lower("username")
HAVING COUNT(*) > 1;

ROLLBACK;
