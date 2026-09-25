BEGIN;

CREATE TABLE "users"."friends" (
    "user_id" UUID NOT NULL,
    "friend_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friends_pkey" PRIMARY KEY ("user_id", "friend_id"),
    CONSTRAINT "friends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."profiles"("user_id") ON DELETE CASCADE,
    CONSTRAINT "friends_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "users"."profiles"("user_id") ON DELETE CASCADE,
    CONSTRAINT "friends_distinct_users_check" CHECK ("user_id" <> "friend_id")
);

CREATE INDEX "friends_friend_id_idx"
    ON "users"."friends" ("friend_id");

CREATE TABLE "users"."presences" (
    "user_id" UUID NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presences_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "presences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."profiles"("user_id") ON DELETE CASCADE
);

COMMIT;
