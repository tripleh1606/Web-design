-- SQLite only: upgrade the previous auth schema (users and sessions must exist).
-- HISTORICAL REFERENCE: week6 now uses PostgreSQL/Supabase. Do not run this SQL
-- against the active app database. Use db:push then db:upgrade:auth after review.
-- Back up the database first. Run once, BEFORE db:push; not for week5 CRUD-only DBs.
-- For week5 CRUD-only DBs, use db:push on a COPY to add all auth tables.
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
ALTER TABLE users ADD COLUMN "emailOriginal" TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer';
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
UPDATE users SET "emailOriginal" = email,
  status = CASE WHEN "emailVerifiedAt" IS NULL THEN 'pending' ELSE 'active' END;
-- SQLite requires rebuilding a table to make a NOT NULL column nullable.
CREATE TABLE sessions_new (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tokenHash" TEXT NOT NULL, "csrfToken" TEXT NOT NULL, "userId" INTEGER,
  "expiresAt" DATETIME NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO sessions_new (id, "tokenHash", "csrfToken", "userId", "expiresAt", "createdAt", "lastSeenAt")
  SELECT id, "tokenHash", "csrfToken", "userId", "expiresAt", "createdAt", "createdAt" FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON sessions("tokenHash");
CREATE INDEX "sessions_userId_idx" ON sessions("userId");
CREATE INDEX "sessions_expiresAt_idx" ON sessions("expiresAt");
CREATE TABLE activation_challenges (
  "userId" INTEGER NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'activation', "otpHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" DATETIME, "lastSentAt" DATETIME NOT NULL, "usedAt" DATETIME
);
CREATE TABLE activation_attempts (
  "emailKey" TEXT NOT NULL PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, "lockedUntil" DATETIME
);
CREATE TABLE rate_limit_buckets (
  key TEXT NOT NULL PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" DATETIME NOT NULL, "nextAllowedAt" DATETIME
);
COMMIT;
