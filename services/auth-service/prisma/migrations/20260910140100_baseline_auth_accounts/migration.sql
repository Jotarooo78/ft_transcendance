-- Auth ownership baseline matching the state created by PRI-2.
--
-- On the shared Transcendence database, user-service migration
-- 20260910140000_split_auth_accounts_and_user_profiles already creates this
-- schema and table. Operators must therefore mark this migration as applied
-- before running Auth's later migrations. Keeping the SQL complete also lets
-- the Auth history build its pre-provisioning state on an empty dedicated
-- database.

CREATE SCHEMA IF NOT EXISTS "auth";

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
