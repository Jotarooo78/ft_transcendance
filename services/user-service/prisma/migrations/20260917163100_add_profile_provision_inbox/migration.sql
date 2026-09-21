CREATE TABLE "users"."inbox_messages" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inbox_messages_aggregate_id_idx"
    ON "users"."inbox_messages"("aggregate_id");
