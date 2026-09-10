-- PRI-2: split the legacy public.users table by data owner.
--
-- Preconditions enforced operationally:
--   * writes to public.users are stopped until compatible application code is live;
--   * public.users comes from 20260905155209_init;
--   * legacy timestamp-without-time-zone values represent UTC;
--   * every legacy row has a username (already enforced by the initial schema).
--
-- This migration deliberately keeps public.users. Removing the legacy table is a
-- later contract migration, after the application cutover and its verification.

BEGIN;

-- Stabilize the source during the copy. SHARE blocks INSERT/UPDATE/DELETE while
-- still allowing read-only inspection. Stopping application writes remains a
-- required precondition because the lock is released at COMMIT.
LOCK TABLE "public"."users" IN SHARE MODE;

-- Refuse a missing username. The initial migration already declares this column
-- NOT NULL, but checking it here makes the backfill contract explicit.
DO $precondition$
DECLARE
    missing_usernames BIGINT;
BEGIN
    SELECT COUNT(*)
      INTO missing_usernames
      FROM "public"."users"
     WHERE "username" IS NULL;

    IF missing_usernames > 0 THEN
        RAISE EXCEPTION
            'PRI-2 blocked: % legacy user(s) have a NULL username',
            missing_usernames;
    END IF;
END
$precondition$;

-- EXPAND: create the two ownership schemas. IF NOT EXISTS is safe for schemas;
-- target tables below intentionally omit it so a partial/foreign table is never
-- accepted silently.
CREATE SCHEMA IF NOT EXISTS "auth";
CREATE SCHEMA IF NOT EXISTS "users";

-- STRUCTURE: target of the private identity and credential data.
CREATE TABLE "auth"."accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounts_email_key"
    ON "auth"."accounts"("email");

-- STRUCTURE: target of public profile data. username is mandatory and unique.
CREATE TABLE "users"."profiles" (
    "user_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX "profiles_username_key"
    ON "users"."profiles"("username");

-- BACKFILL: preserve the UUID, email and existing password hash byte for byte.
-- The explicit UTC conversion avoids a session-dependent cast from the legacy
-- timestamp-without-time-zone columns to TIMESTAMPTZ.
INSERT INTO "auth"."accounts" (
    "id",
    "email",
    "password_hash",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "email",
    "passwordHash",
    "createdAt" AT TIME ZONE 'UTC',
    "updatedAt" AT TIME ZONE 'UTC'
FROM "public"."users";

-- BACKFILL: preserve profile values without case normalization. The one approved
-- transformation is the legacy displayName fallback: when it is NULL, use the
-- mandatory username. There is deliberately no ON CONFLICT, so a collision must
-- abort visibly instead of skipping a historical row.
INSERT INTO "users"."profiles" (
    "user_id",
    "username",
    "display_name",
    "avatar_url",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "username",
    COALESCE("displayName", "username"),
    "avatarUrl",
    "createdAt" AT TIME ZONE 'UTC',
    "updatedAt" AT TIME ZONE 'UTC'
FROM "public"."users";

-- VERIFY: make the migration itself fail if a row is missing or if a supposedly
-- preserved value differs. The source remains available for independent review.
DO $verification$
DECLARE
    source_count BIGINT;
    account_count BIGINT;
    profile_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO source_count FROM "public"."users";
    SELECT COUNT(*) INTO account_count FROM "auth"."accounts";
    SELECT COUNT(*) INTO profile_count FROM "users"."profiles";

    IF source_count <> account_count OR source_count <> profile_count THEN
        RAISE EXCEPTION
            'PRI-2 count mismatch: source=%, accounts=%, profiles=%',
            source_count, account_count, profile_count;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "public"."users" AS legacy
          LEFT JOIN "auth"."accounts" AS account
            ON account."id" = legacy."id"
         WHERE account."id" IS NULL
            OR ROW(
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
    ) THEN
        RAISE EXCEPTION 'PRI-2 account verification failed';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "public"."users" AS legacy
          LEFT JOIN "users"."profiles" AS profile
            ON profile."user_id" = legacy."id"
         WHERE profile."user_id" IS NULL
            OR ROW(
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
            )
    ) THEN
        RAISE EXCEPTION 'PRI-2 profile verification failed';
    END IF;
END
$verification$;

COMMIT;
