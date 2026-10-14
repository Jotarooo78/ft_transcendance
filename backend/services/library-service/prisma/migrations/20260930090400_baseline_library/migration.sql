CREATE TABLE "library"."playlists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "playlists_name_check"
        CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "playlists_description_check"
        CHECK ("description" IS NULL OR char_length("description") <= 2000),
    CONSTRAINT "playlists_visibility_check"
        CHECK ("visibility" IN ('private', 'unlisted', 'public')),
    CONSTRAINT "playlists_version_check"
        CHECK ("version" > 0)
);

CREATE INDEX "playlists_owner_idx"
    ON "library"."playlists"("owner_user_id", "updated_at" DESC, "id");

CREATE TABLE "library"."playlist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "playlist_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "added_by_user_id" UUID,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "playlist_items_playlist_fkey"
        FOREIGN KEY ("playlist_id")
        REFERENCES "library"."playlists"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "playlist_items_position_check"
        CHECK ("position" > 0),
    CONSTRAINT "playlist_items_playlist_position_key"
        UNIQUE ("playlist_id", "position")
        DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX "playlist_items_track_idx"
    ON "library"."playlist_items"("track_id");

CREATE TABLE "library"."track_favorites" (
    "user_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_favorites_pkey" PRIMARY KEY ("user_id", "track_id")
);

CREATE INDEX "favorites_track_idx"
    ON "library"."track_favorites"("track_id");
