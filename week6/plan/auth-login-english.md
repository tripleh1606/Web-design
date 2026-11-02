# Implementation plan — shared foundation, login and protected CRUD

Updated 2026-11-02. Planning only. Read [shared contract](auth-parallel-plan.md) first; its tables are authoritative. Source slides 24–36, 49, 52–54, 59–60.

## Ownership and integration order

One integrator owns restaurant/package.json/lock, prisma/schema.prisma, server.js, src/app.js, all shared auth helpers, src/auth/login.js, views/auth/login.ejs, header/admin form edits, shared HTTP tests/live harness, README/.env.example, auth seed and expired-session cleanup scripts. Other feature owners have disjoint files listed in the contract.

1. Install dependencies through normal npm/lockfile workflow and run existing tests. Select a maintained Argon2id/email/cookie/CSRF implementation and the Google adapter matching real keys; document concrete versions/config when installed. Do not hand-roll password algorithms.
2. Add all User/ActivationChallenge/ActivationAttempt/PasswordReset/Session/LoginAttempt/RateLimitBucket schema fields together. Generate client; apply only to an explicitly selected test DB during verification. Do not alter restaurant data or run destructive seed.
3. Implement actual shared config/credentials/session/throttle/captcha/mail modules and their test fixtures. No imports of absent feature modules, fake production adapters or success stubs. Complete this foundation before parallel feature owners depend on it.
4. Implement login, then mount the completed registration/activation/logout/reset routers at root. Apply common headers, guard /dishes, /dishes/:id and the entire /admin prefix, and CSRF all mutation forms. Feature routing can be integrated sequentially; registration does not need to be complete to test session mechanics with controlled test fixtures.
5. Adapt existing CRUD tests, including /dishes read tests, to authenticated requests while preserving CRUD assertions. Anonymous requests now require 303 /login with no CRUD DB read/write. Update README to the actual week6 path and current commands.

## Login and brute-force behavior

GET /login is public and establishes/reuses an anonymous form session and CSRF token. Show email/password and server-driven CAPTCHA-required state; for the selected score-based provider, obtain a fresh login-action token at submit rather than reusing the old draft's v2 checkbox. On first POST reaching a CAPTCHA requirement without a token, return the form requesting it before verifying password.

POST /login order: check IP/email request rules and current lockedUntil → CSRF/input validation → CAPTCHA if required → password verification → active status → transaction/session creation. The source explicitly requires the limit check before CAPTCHA/password. All thresholds/window values come from the common policy.

Unknown email and wrong password have the same 200 form error and failure-counter behavior. Perform a library dummy-hash verification for unknown accounts to reduce a timing signal. Keep email; clear password. Increment failures atomically; from the third failure request CAPTCHA on the next attempt; the tenth failure sets a five-minute lock and returns 429. CAPTCHA failure does not test password, but counts as a request toward rate limits.

A correct CAPTCHA never clears counters or cancels a lock. A correct pending-account password never creates an authenticated session or clears the failure counter. Only active + correct password + successful session creation clears the email failure count; IP limits stay. Do not treat provider errors as wrong passwords.

Serialize email-failure decisions and updates so concurrent requests cannot bypass CAPTCHA/lock thresholds. At minimum recheck the latest counter under the per-email gate before accepting a password attempt; record the attempted failure atomically. Do not hold a database transaction open during a network CAPTCHA request: validate the external proof first after initial lock check, then recheck limits under the gate before password verification/session result. Tests must cover concurrent failures crossing the threshold.

## Persistent session, rotation and CSRF

Use cookie sid with a random opaque value; store sidHash and server-side session data in PostgreSQL. Anonymous form sessions have null userId and cannot pass requireLogin. Active sessions require active User and emailVerifiedAt.

During login take the same User lock used by reset. Re-read passwordHash/status; if earlier password verification used an obsolete hash, reject or reverify before creating the session. Atomically revoke only the presented previous session and persist a new sid, userId, CSRF token and timestamps. Emit Set-Cookie only after commit. A reset and racing old-password login must not leave a new authenticated session after reset.

Server enforces idle 30 minutes and absolute 24 hours. Persist lastSeenAt without recreating deleted rows or extending absolute expiry. Reject expired/unknown/malformed cookies as unauthenticated; do not turn a DB outage into apparent logout. Publish periodic expired-row cleanup; expiry checks work before cleanup runs.

Cookie attributes: HttpOnly; Path=/; host-only; SameSite=Lax; Secure on deployed HTTPS. Match scope when clearing. Preserve distinct Set-Cookie headers. Anonymous session TTL is 30 minutes. Rotate sid when login changes identity.

CSRF token is tied to the current server-side session and rendered into every auth POST and admin mutation form. Check submitted token and supplied Origin/Referer against configured origin; absent Origin/Referer does not bypass token validation. Method-override PATCH/DELETE and association forms must be covered. Login rotates the token with the session.

## CRUD and views

Mount requireLogin before /dishes, /dishes/:id and every /admin handler; do not require role=admin in this block. All active users including viewer can manage CRUD. Anonymous, pending, expired or revoked sessions receive **303 Location: /login** for GET/POST/PATCH/DELETE and no CRUD queries/mutations. Auth forms and static assets remain public; the previous public menu becomes protected to satisfy slide 54.

Header: anonymous login/register; authenticated escaped email and POST /logout with CSRF. Add auth/forgot/reset navigation. Admin POST forms, including delete/unlink/association forms, receive hidden CSRF. Auth/protected-data responses no-store; reset pages no-referrer and no third-party resources. Retain existing escaped EJS/error handling and sanitize logs.

## Seed and testing

Add explicit prisma/seed-auth.js using AUTH_SEED_EMAIL/PASSWORD env to create one active verified account for the course demo. Hash password, never print it, never overwrite an existing pending/active credential; no automatic startup seed or destructive restaurant seed.

Write HTTP tests for all login branches, counter transitions, CAPTCHA bypass attempts, session rotation/expiry/deletion, CSRF, direct CRUD guard coverage and preserved authenticated CRUD. Use a fake clock for deterministic threshold/expiry tests and real PostgreSQL for races and rollback.

Live harness must explicitly target a disposable database and clean only its own fixture IDs. Keep existing read-only live checks read-only unless introducing a clearly named/opt-in write harness. Demonstrate a real process stop/restart with the same DB and cookie, proving session survival; recreating an app object is insufficient. Demo an active account and a pending account, real email/CAPTCHA separately, two sessions for logout and reset tests.

Checklist C01–C06 and S01–S09 plus integration checks from all feature plans must pass. Missing keys/database means unfinished live verification, not evidence from mocks. Never report runtime acceptance during this planning task.
