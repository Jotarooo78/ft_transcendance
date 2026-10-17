CREATE TABLE "library"."saved_items" (
  "user_id" UUID NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('project', 'artist', 'playlist')),
  "target_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "kind", "target_id")
);
CREATE INDEX "saved_items_recent_idx" ON "library"."saved_items" ("user_id", "kind", "created_at" DESC, "target_id");
CREATE INDEX "favorites_recent_idx" ON "library"."track_favorites" ("user_id", "created_at" DESC, "track_id");
