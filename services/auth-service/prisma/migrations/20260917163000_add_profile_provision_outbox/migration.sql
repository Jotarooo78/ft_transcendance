-- Existing accounts predate profile provisioning state and are already usable.
ALTER TABLE "auth"."accounts"
    ADD COLUMN "state" TEXT;

UPDATE "auth"."accounts"
SET "state" = 'active'
WHERE "state" IS NULL;

ALTER TABLE "auth"."accounts"
    ALTER COLUMN "state" SET NOT NULL,
    ALTER COLUMN "state" SET DEFAULT 'pending_profile';

ALTER TABLE "auth"."accounts"
    ADD CONSTRAINT "accounts_state_check"
    CHECK ("state" IN ('pending_profile', 'active', 'profile_failed'));

CREATE TABLE "auth"."outbox_messages" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "aggregate_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_messages_status_check"
        CHECK ("status" IN ('pending', 'delivered', 'failed')),
    CONSTRAINT "outbox_messages_account_fkey"
        FOREIGN KEY ("aggregate_id")
        REFERENCES "auth"."accounts"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX "outbox_messages_status_next_attempt_at_idx"
    ON "auth"."outbox_messages"("status", "next_attempt_at");

CREATE INDEX "outbox_messages_aggregate_id_idx"
    ON "auth"."outbox_messages"("aggregate_id");
