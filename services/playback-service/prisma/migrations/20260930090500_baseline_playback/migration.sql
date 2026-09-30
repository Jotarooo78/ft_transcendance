CREATE TABLE "playback"."sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "track_id" UUID NOT NULL,
    "track_duration_ms" BIGINT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "listened_ms" BIGINT NOT NULL DEFAULT 0,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "counting_rule_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_track_duration_ms_check"
        CHECK ("track_duration_ms" > 0),
    CONSTRAINT "sessions_listened_ms_check"
        CHECK ("listened_ms" >= 0),
    CONSTRAINT "sessions_last_sequence_check"
        CHECK ("last_sequence" >= 0),
    CONSTRAINT "sessions_counting_rule_version_check"
        CHECK ("counting_rule_version" > 0),
    CONSTRAINT "sessions_time_order_check"
        CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);

CREATE INDEX "listening_history_idx"
    ON "playback"."sessions"("user_id", "started_at" DESC, "id");

CREATE TABLE "playback"."events" (
    "session_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "listened_ms_total" BIGINT NOT NULL,
    "position_ms" BIGINT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("session_id", "sequence"),
    CONSTRAINT "events_session_fkey"
        FOREIGN KEY ("session_id")
        REFERENCES "playback"."sessions"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "events_sequence_check"
        CHECK ("sequence" > 0),
    CONSTRAINT "events_listened_ms_total_check"
        CHECK ("listened_ms_total" >= 0),
    CONSTRAINT "events_position_ms_check"
        CHECK ("position_ms" >= 0)
);
