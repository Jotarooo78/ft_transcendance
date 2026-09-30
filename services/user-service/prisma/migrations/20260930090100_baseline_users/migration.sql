CREATE TABLE "users"."profiles" (
    "user_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "profiles_username_canonical_check"
        CHECK (
            "username" = lower(btrim("username"))
            AND "username" ~ '^[a-z0-9_]{3,30}$'
        )
);

CREATE UNIQUE INDEX "profiles_username_key"
    ON "users"."profiles"("username");

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

CREATE TABLE "users"."friends" (
    "user_id" UUID NOT NULL,
    "friend_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friends_pkey" PRIMARY KEY ("user_id", "friend_id"),
    CONSTRAINT "friends_user_id_fkey"
        FOREIGN KEY ("user_id")
        REFERENCES "users"."profiles"("user_id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "friends_friend_id_fkey"
        FOREIGN KEY ("friend_id")
        REFERENCES "users"."profiles"("user_id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "friends_distinct_users_check"
        CHECK ("user_id" <> "friend_id")
);

CREATE INDEX "friends_friend_id_idx"
    ON "users"."friends"("friend_id");

CREATE TABLE "users"."presences" (
    "user_id" UUID NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presences_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "presences_user_id_fkey"
        FOREIGN KEY ("user_id")
        REFERENCES "users"."profiles"("user_id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);
