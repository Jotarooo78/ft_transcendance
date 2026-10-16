CREATE TABLE "chat"."conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_a_id" UUID NOT NULL,
    "user_b_id" UUID NOT NULL,
    "last_read_a_message_id" BIGINT,
    "last_read_b_message_id" BIGINT,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_pair_order_check"
        CHECK ("user_a_id" < "user_b_id"),
    CONSTRAINT "conversations_pair_key"
        UNIQUE ("user_a_id", "user_b_id")
);

CREATE INDEX "conversations_user_b_idx"
    ON "chat"."conversations"("user_b_id");

CREATE TABLE "chat"."messages" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "messages_conversation_fkey"
        FOREIGN KEY ("conversation_id")
        REFERENCES "chat"."conversations"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "messages_body_check"
        CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000)
);

CREATE INDEX "messages_conversation_idx"
    ON "chat"."messages"("conversation_id", "id" DESC);
