CREATE TABLE "catalog"."artists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "image_asset_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "artists_name_check"
        CHECK (char_length(btrim("name")) BETWEEN 1 AND 150),
    CONSTRAINT "artists_slug_check"
        CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX "artists_slug_key"
    ON "catalog"."artists"("slug");

CREATE TABLE "catalog"."artist_members" (
    "artist_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_members_pkey" PRIMARY KEY ("artist_id", "user_id"),
    CONSTRAINT "artist_members_artist_fkey"
        FOREIGN KEY ("artist_id")
        REFERENCES "catalog"."artists"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "artist_members_role_check"
        CHECK ("role" IN ('owner', 'editor'))
);

CREATE INDEX "artist_members_user_idx"
    ON "catalog"."artist_members"("user_id");

CREATE TABLE "catalog"."tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "audio_asset_id" UUID,
    "duration_ms" BIGINT,
    "explicit" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tracks_title_check"
        CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "tracks_duration_ms_check"
        CHECK ("duration_ms" IS NULL OR "duration_ms" > 0),
    CONSTRAINT "tracks_status_check"
        CHECK ("status" IN ('draft', 'published', 'withdrawn')),
    CONSTRAINT "tracks_version_check"
        CHECK ("version" > 0),
    CONSTRAINT "tracks_published_fields_check"
        CHECK (
            "status" <> 'published'
            OR (
                "audio_asset_id" IS NOT NULL
                AND "duration_ms" IS NOT NULL
                AND "published_at" IS NOT NULL
            )
        )
);

CREATE INDEX "tracks_published_idx"
    ON "catalog"."tracks"("published_at" DESC, "id")
    WHERE "status" = 'published';

CREATE TABLE "catalog"."track_artists" (
    "track_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "credit_order" INTEGER NOT NULL,

    CONSTRAINT "track_artists_pkey" PRIMARY KEY ("track_id", "artist_id", "role"),
    CONSTRAINT "track_artists_track_fkey"
        FOREIGN KEY ("track_id")
        REFERENCES "catalog"."tracks"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "track_artists_artist_fkey"
        FOREIGN KEY ("artist_id")
        REFERENCES "catalog"."artists"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT "track_artists_role_check"
        CHECK ("role" IN ('primary', 'featured', 'composer', 'producer')),
    CONSTRAINT "track_artists_credit_order_check"
        CHECK ("credit_order" > 0)
);

CREATE UNIQUE INDEX "track_artists_track_role_order_key"
    ON "catalog"."track_artists"("track_id", "role", "credit_order");

CREATE INDEX "track_artists_artist_idx"
    ON "catalog"."track_artists"("artist_id");

CREATE TABLE "catalog"."releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "release_type" TEXT NOT NULL,
    "release_date" DATE,
    "cover_asset_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "releases_title_check"
        CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "releases_type_check"
        CHECK ("release_type" IN ('single', 'ep', 'album', 'compilation')),
    CONSTRAINT "releases_status_check"
        CHECK ("status" IN ('draft', 'published', 'withdrawn')),
    CONSTRAINT "releases_published_date_check"
        CHECK ("status" <> 'published' OR "release_date" IS NOT NULL)
);

CREATE TABLE "catalog"."release_artists" (
    "release_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,
    "credit_order" INTEGER NOT NULL,

    CONSTRAINT "release_artists_pkey" PRIMARY KEY ("release_id", "artist_id"),
    CONSTRAINT "release_artists_release_fkey"
        FOREIGN KEY ("release_id")
        REFERENCES "catalog"."releases"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "release_artists_artist_fkey"
        FOREIGN KEY ("artist_id")
        REFERENCES "catalog"."artists"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT "release_artists_credit_order_check"
        CHECK ("credit_order" > 0)
);

CREATE UNIQUE INDEX "release_artists_release_order_key"
    ON "catalog"."release_artists"("release_id", "credit_order");

CREATE INDEX "release_artists_artist_idx"
    ON "catalog"."release_artists"("artist_id");

CREATE TABLE "catalog"."release_tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "disc_number" INTEGER NOT NULL DEFAULT 1,
    "track_number" INTEGER NOT NULL,

    CONSTRAINT "release_tracks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "release_tracks_release_fkey"
        FOREIGN KEY ("release_id")
        REFERENCES "catalog"."releases"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "release_tracks_track_fkey"
        FOREIGN KEY ("track_id")
        REFERENCES "catalog"."tracks"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT "release_tracks_disc_number_check"
        CHECK ("disc_number" > 0),
    CONSTRAINT "release_tracks_track_number_check"
        CHECK ("track_number" > 0),
    CONSTRAINT "release_tracks_release_position_key"
        UNIQUE ("release_id", "disc_number", "track_number")
        DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX "release_tracks_track_idx"
    ON "catalog"."release_tracks"("track_id");

CREATE TABLE "catalog"."genres" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "genres_name_check"
        CHECK (char_length(btrim("name")) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX "genres_name_key"
    ON "catalog"."genres"("name");

CREATE TABLE "catalog"."track_genres" (
    "track_id" UUID NOT NULL,
    "genre_id" UUID NOT NULL,

    CONSTRAINT "track_genres_pkey" PRIMARY KEY ("track_id", "genre_id"),
    CONSTRAINT "track_genres_track_fkey"
        FOREIGN KEY ("track_id")
        REFERENCES "catalog"."tracks"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "track_genres_genre_fkey"
        FOREIGN KEY ("genre_id")
        REFERENCES "catalog"."genres"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

CREATE INDEX "track_genres_genre_idx"
    ON "catalog"."track_genres"("genre_id");
