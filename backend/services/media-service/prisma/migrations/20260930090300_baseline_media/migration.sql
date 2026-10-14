CREATE TABLE "media"."assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "uploader_user_id" UUID,
    "purpose" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" BIGINT,
    "duration_ms" BIGINT,
    "checksum_sha256" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assets_purpose_check"
        CHECK ("purpose" IN ('audio', 'cover', 'avatar')),
    CONSTRAINT "assets_state_check"
        CHECK ("state" IN ('pending', 'processing', 'ready', 'failed', 'deleting', 'deleted')),
    CONSTRAINT "assets_byte_size_check"
        CHECK ("byte_size" IS NULL OR "byte_size" >= 0),
    CONSTRAINT "assets_duration_ms_check"
        CHECK ("duration_ms" IS NULL OR "duration_ms" > 0),
    CONSTRAINT "assets_ready_size_check"
        CHECK ("state" <> 'ready' OR "byte_size" IS NOT NULL),
    CONSTRAINT "assets_ready_audio_duration_check"
        CHECK ("state" <> 'ready' OR "purpose" <> 'audio' OR "duration_ms" IS NOT NULL)
);

CREATE UNIQUE INDEX "assets_storage_key_key"
    ON "media"."assets"("storage_key");

CREATE INDEX "assets_uploader_idx"
    ON "media"."assets"("uploader_user_id");

CREATE TABLE "media"."variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "rendition_key" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "bitrate_kbps" INTEGER,
    "byte_size" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "variants_asset_fkey"
        FOREIGN KEY ("asset_id")
        REFERENCES "media"."assets"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "variants_bitrate_kbps_check"
        CHECK ("bitrate_kbps" IS NULL OR "bitrate_kbps" > 0),
    CONSTRAINT "variants_byte_size_check"
        CHECK ("byte_size" >= 0)
);

CREATE UNIQUE INDEX "variants_storage_key_key"
    ON "media"."variants"("storage_key");

CREATE UNIQUE INDEX "variants_asset_rendition_key"
    ON "media"."variants"("asset_id", "rendition_key");
