-- Week6 PostgreSQL: one-time additive auth setup for a week5 CRUD-only database.
-- Generated from schema.prisma; reviewed to exclude every week5 DROP/ALTER.
-- Does not update existing auth schemas. Re-running fails and rolls back.
-- Run against the DATABASE_URL selected locally; never use db:push to replace this on the shared FTS database.
BEGIN;
SET LOCAL search_path TO public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('week6:auth-schema-setup'));

CREATE TYPE "AccountStatus" AS ENUM ('pending', 'active');

CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "emailOriginal" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "status" "AccountStatus" NOT NULL DEFAULT 'pending',
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "userId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_verification_tokens" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "login_attempts" (
    "email" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastFailure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("email")
);

CREATE TABLE "activation_challenges" (
    "userId" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'activation',
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "activation_challenges_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "activation_attempts" (
    "emailKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "activation_attempts_pkey" PRIMARY KEY ("emailKey")
);

CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "nextAllowedAt" TIMESTAMP(3),

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "login_ip_limits" (
    "ip" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_ip_limits_pkey" PRIMARY KEY ("ip")
);

CREATE TABLE "password_resets" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_limits_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

CREATE INDEX "email_verification_tokens_expiresAt_idx" ON "email_verification_tokens"("expiresAt");

CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

CREATE INDEX "password_resets_userId_idx" ON "password_resets"("userId");

CREATE INDEX "password_resets_expiresAt_idx" ON "password_resets"("expiresAt");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activation_challenges" ADD CONSTRAINT "activation_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
