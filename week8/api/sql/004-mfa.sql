-- Additive Week 8 MFA tables. Does not change business data or old auth columns.
CREATE TABLE IF NOT EXISTS "mfa_credentials" (
  "userId" INTEGER PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "secretCipher" TEXT,
  "pendingCipher" TEXT,
  "pendingExpiresAt" TIMESTAMP(3),
  "lastStep" INTEGER,
  "authVersion" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS "mfa_challenges" (
  "tokenHash" TEXT PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "authVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "mfa_challenges_userId_idx" ON "mfa_challenges"("userId");
CREATE INDEX IF NOT EXISTS "mfa_challenges_expiresAt_idx" ON "mfa_challenges"("expiresAt");
CREATE TABLE IF NOT EXISTS "mfa_recovery_codes" (
  "codeHash" TEXT PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "usedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "mfa_recovery_codes_userId_idx" ON "mfa_recovery_codes"("userId");
