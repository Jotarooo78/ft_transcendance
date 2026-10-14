CREATE TABLE "auth"."accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending_profile',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounts_state_check"
        CHECK ("state" IN ('pending_profile', 'active', 'profile_failed'))
);

CREATE UNIQUE INDEX "accounts_email_key"
    ON "auth"."accounts"("email");

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
