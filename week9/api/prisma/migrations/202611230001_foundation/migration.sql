CREATE TABLE "photos" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "alt" TEXT NOT NULL,
  "width" INTEGER NOT NULL CHECK (width > 0),
  "height" INTEGER NOT NULL CHECK (height > 0),
  "published" BOOLEAN NOT NULL CHECK (published IN (0, 1)),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE "photo_variants" (
  "photo_id" TEXT NOT NULL,
  "width" INTEGER NOT NULL CHECK (width > 0),
  "height" INTEGER NOT NULL CHECK (height > 0),
  "bytes" INTEGER NOT NULL CHECK (bytes > 0),
  "mime" TEXT NOT NULL CHECK (mime = 'image/webp'),
  "storage_key" TEXT NOT NULL,
  PRIMARY KEY ("photo_id", "width"),
  CONSTRAINT "photo_variants_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "cleanup_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "photo_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK (kind IN ('upload', 'delete')),
  "keys_json" TEXT NOT NULL
);
CREATE TABLE "manager_sessions" (
  "token_hash" TEXT NOT NULL PRIMARY KEY,
  "expires_at" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "photo_variants_storage_key_key" ON "photo_variants"("storage_key");
CREATE UNIQUE INDEX "cleanup_jobs_photo_id_kind_key" ON "cleanup_jobs"("photo_id", "kind");
CREATE INDEX "photos_published_created_at_id_idx" ON "photos"("published", "created_at", "id");
CREATE INDEX "manager_sessions_expires_at_idx" ON "manager_sessions"("expires_at");
