-- Independent, read-only verification after PRI-2.
-- Expected: the first three counts are equal and every anomaly count is 0.
BEGIN TRANSACTION READ ONLY;

SELECT 'legacy_rows' AS check_name, COUNT(*) AS result
FROM "public"."users"
UNION ALL
SELECT 'account_rows', COUNT(*)
FROM "auth"."accounts"
UNION ALL
SELECT 'profile_rows', COUNT(*)
FROM "users"."profiles"
UNION ALL
SELECT 'missing_account_ids', COUNT(*)
FROM "public"."users" AS legacy
LEFT JOIN "auth"."accounts" AS account ON account."id" = legacy."id"
WHERE account."id" IS NULL
UNION ALL
SELECT 'missing_profile_ids', COUNT(*)
FROM "public"."users" AS legacy
LEFT JOIN "users"."profiles" AS profile ON profile."user_id" = legacy."id"
WHERE profile."user_id" IS NULL
UNION ALL
SELECT 'unexpected_account_ids', COUNT(*)
FROM "auth"."accounts" AS account
LEFT JOIN "public"."users" AS legacy ON legacy."id" = account."id"
WHERE legacy."id" IS NULL
UNION ALL
SELECT 'unexpected_profile_ids', COUNT(*)
FROM "users"."profiles" AS profile
LEFT JOIN "public"."users" AS legacy ON legacy."id" = profile."user_id"
WHERE legacy."id" IS NULL;

SELECT 'account_value_violations' AS check_name, COUNT(*) AS result
FROM "public"."users" AS legacy
JOIN "auth"."accounts" AS account ON account."id" = legacy."id"
WHERE ROW(
    account."email",
    account."password_hash",
    account."created_at",
    account."updated_at"
) IS DISTINCT FROM ROW(
    legacy."email",
    legacy."passwordHash",
    legacy."createdAt" AT TIME ZONE 'UTC',
    legacy."updatedAt" AT TIME ZONE 'UTC'
)
UNION ALL
SELECT 'profile_value_violations', COUNT(*)
FROM "public"."users" AS legacy
JOIN "users"."profiles" AS profile ON profile."user_id" = legacy."id"
WHERE ROW(
    profile."username",
    profile."display_name",
    profile."avatar_url",
    profile."created_at",
    profile."updated_at"
) IS DISTINCT FROM ROW(
    legacy."username",
    COALESCE(legacy."displayName", legacy."username"),
    legacy."avatarUrl",
    legacy."createdAt" AT TIME ZONE 'UTC',
    legacy."updatedAt" AT TIME ZONE 'UTC'
);

ROLLBACK;
