# Shared contract: parallel registration, login and logout

## Current context

The user requests three implementation-plan files plus a shared contract permitting parallel implementation: registration with real verification email and Google reCAPTCHA, login using cookie sessions persisted in PostgreSQL, authenticated-only CRUD, and logout. The user explicitly selected protecting the existing SSR/form `/admin` endpoints, not adding JSON APIs. Public menu browsing stays public. This contract is authoritative for the three companion plans; existing source paths below were inspected by AuthDiscovery and AuthContractDesign during this session, proposed auth paths do not exist yet.

Existing application: CommonJS Node >=20, Express 4/EJS, Prisma 6.12/PostgreSQL (`restaurant/package.json:1-29`); app factory `createApp({ prisma, logger = console })` (`restaurant/src/app.js:16-402`); startup (`restaurant/server.js:1-27`); no auth entities (`restaurant/prisma/schema.prisma:1-68`). Existing CRUD tests use an injected fake Prisma and assume public admin access (`restaurant/tests/app.test.js:18-135,167-184`); live smoke also assumes it (`restaurant/tests/live-smoke.js:24-26`). Commands below execute from `restaurant/` only after implementation approval, never during planning.

## Required functionality

Only verified users may access any `/admin` route, including read pages and all entity/association writes. A browser holds an opaque session identifier in an HttpOnly cookie; session state survives application restart in PostgreSQL. Email verification does not log a user in. Logout invalidates the current DB session, not every session belonging to that user. Multiple devices may remain logged in independently. Cookie and verification secrets are stored hashed, never raw, in DB.

## Overall implementation approach

### Ownership and execution barriers

Assign exactly one integrator, also the login implementer. First that owner completes the real shared foundation: dependencies/lockfile, schema, generated Prisma client and complete `src/auth/session.js` shared utilities/middleware; these have no imports of registration/logout. This barrier exposes working code, not stubs, fake routes or no-op interfaces. Do not wire imports into `app.js` while the corresponding modules are missing. Then registration, remaining login/integration work and logout execute concurrently within the exclusive files below. The integrator mounts all routers after the three real modules are present. No other worker edits shared files, dependency manifests, schema or generated files. Do not run shared installs, generation, tests or formatters concurrently with edits. A short shared prerequisite is necessary; the three tasks are independent after it, not magically independent before it.

- Registration owns proposed `restaurant/src/auth/registration.js`, `restaurant/views/auth/register.ejs`, `restaurant/views/auth/verify-result.ejs`, `restaurant/tests/auth-registration.test.js` only.
- Logout owns proposed `restaurant/src/auth/logout.js`, `restaurant/tests/auth-logout.test.js` only.
- Login/integrator owns proposed `restaurant/src/auth/session.js`, `restaurant/views/auth/login.ejs`, `restaurant/tests/auth-session.test.js`; existing `restaurant/package.json`, `restaurant/package-lock.json`, `restaurant/.env.example`, `restaurant/prisma/schema.prisma`, `restaurant/generated/prisma/**`, `restaurant/server.js`, `restaurant/src/app.js`, `restaurant/views/partials/header.ejs`, `restaurant/views/admin/form.ejs`, `restaurant/views/admin/delete.ejs`, `restaurant/views/admin/unlink.ejs`, `restaurant/views/admin/dish-detail.ejs`, `restaurant/views/admin/dish-ingredient-edit.ejs`, `restaurant/views/admin/chef-detail.ejs`, `restaurant/tests/app.test.js`, `restaurant/tests/live-smoke.js`. Do not introduce unrelated styling work. Login integrator owns any behavior documentation automatically required by repository conventions.

### Frozen persistence schema

Append these models, leaving all restaurant entities unchanged:

```prisma
model User {
  id Int @id @default(autoincrement())
  email String @unique
  passwordHash String
  emailVerifiedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  sessions Session[]
  verificationTokens EmailVerificationToken[]
  @@map("users")
}
model Session {
  id Int @id @default(autoincrement())
  tokenHash String @unique
  csrfToken String
  userId Int
  expiresAt DateTime
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}
model EmailVerificationToken {
  id Int @id @default(autoincrement())
  tokenHash String @unique
  userId Int
  expiresAt DateTime
  usedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
  @@map("email_verification_tokens")
}
```

Use existing `npm run db:generate` / `npm run db:push` convention, not a second migration convention. `db:push` requires a dedicated disposable verification database, never an unapproved production database. Do not run seed for authentication smoke: the existing seed was inspected and must be reread for destructive behavior before any separate use.

### Frozen shared module API

`restaurant/src/auth/session.js` exports these CommonJS functions; all named functions must be real implementations before the barrier clears:

- `resolveAuthConfig(overrides = {}) -> config`: input overrides and output share keys `appBaseUrl`, `sessionCookieName`, `csrfCookieName`, `sessionTtlMs`, `emailVerifyTtlMs`, `cookieSecure`, `recaptchaSiteKey`, `recaptchaSecretKey`. Explicit overrides take precedence over env; TTL overrides are positive safe-integer milliseconds, env SESSION_TTL_HOURS/EMAIL_VERIFY_TTL_HOURS are positive finite integer hours converted to safe-integer milliseconds, defaults24h. Default origin is `http://localhost:${process.env.PORT || 3001}`; validate HTTP(S) root URL with no credentials/query/fragment/non-root path and strip trailing slash. In production require explicitly configured public HTTPS APP_BASE_URL. Invalid supplied config throws at startup. Derive Secure from production OR normalized HTTPS origin, with explicit boolean override only through injected test config. Default names soucha_session/soucha_csrf; cookie names must match HTTP token syntax. Only tests may override csrfCookieName.
- `normalizeEmail(value) -> string`: string trim + lowercase or empty. Both forms use email max 120 chars and `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- `hashPassword(password) -> Promise<string>` and `verifyPassword(password, storedHash) -> Promise<boolean>`: Node async scrypt, 16 random salt bytes, 64 derived bytes, `N=16384,r=8,p=1`; store `scrypt$<32 lower hex salt>$<128 lower hex key>`. Hash UTF-8 password exactly as entered (no trim or Unicode normalization). Reject malformed hashes without throwing; use timingSafeEqual. Registration password 8..128 characters inclusive, exact confirmPassword match. Login caps input at 128 and uses a valid precomputed dummy hash on unknown email; no per-request dummy generation.
- `generateRawToken() -> string`: 32 random bytes as 64 lowercase hex; `hashToken(rawToken) -> string`: SHA-256 lowercase hex; `safeEqualToken(a,b) -> boolean`: require two 64-lowercase-hex strings then constant-time buffer comparison.
- `parseCookies(header = '') -> object`: parse semicolon-separated cookie pairs, use safe decoding, ignore malformed encoding; duplicate cookie names invalidate that cookie instead of selecting attacker-controlled order. `serializeCookie(name,value,options) -> string` is internal reusable export; options are `httpOnly`, `secure`, `sameSite`, `path`, `maxAge` (seconds), `expires` (Date).
- `setSessionCookie(res, rawToken, config)` and `clearSessionCookie(res, config)`: append Set-Cookie (never overwrite another cookie). Session attributes `HttpOnly; Path=/; SameSite=Lax`, conditional `Secure`; issue `Max-Age=floor(sessionTtlMs/1000)`, clear `Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`. Host-only, no Domain. Anonymous CSRF cookie uses same attributes and Max-Age 7200.
- `sanitizeNextPath(value) -> string`: allow only same-origin paths whose pathname is exactly `/admin` or starts `/admin/`, maximum 200 chars, no backslashes, controls, protocol-relative prefixes or encoded pathname separators; otherwise `/admin/dishes`. Validate against a fixed dummy origin with URL, return pathname+search only; never forward `_method` on a redirect target. This is a navigation target, never write replay.
- `createSessionForUser({ prisma, userId, authConfig, res }) -> Promise<{rawToken,tokenHash,csrfToken,expiresAt}>`: create fresh token/CSRF and persist session, absolute expiresAt=now+TTL. `res` is optional: when supplied append cookie after persistence; when omitted return token data without emitting headers. Login passes the transaction delegate as prisma and omits res while atomically deleting only the old presented row and creating the new one; after transaction commits, call setSessionCookie with real res. No sliding refresh; unrelated sessions remain. A failed DB operation emits neither a successful-login redirect nor a new session cookie.
- `attachSessionMiddleware({ prisma, authConfig }) -> middleware`: initialize `req.auth={user:null,session:null,rawToken:null}`, `req.cookies`, `res.locals.currentUser=null`, `res.locals.csrfToken=''`; look up a valid-format session cookie by tokenHash including user. Authenticate only existing unexpired row with verified user. Populate req.auth (full user/session internal only), render currentUser `{id,email}`, and persisted session csrfToken. Missing/invalid/expired/deleted/unverified session cookie is cleared; expired rows may be deleteMany by tokenHash. Never treat DB outage as anonymous; next(error) and existing 500 response. For anonymous GET auth forms generate/reuse 64-hex `soucha_csrf` cookie and expose same token through res.locals and `req.csrfToken`; initialization on other dynamic routes may do likewise, but never manufacture a successful submitted token. Async middleware forwards errors under Express 4.
- `requireCsrf(req,res,next)`: expected token is authenticated DB session csrfToken, otherwise incoming anonymous CSRF cookie; submitted body field is `_csrf`; missing/malformed/mismatch -> 403 error view. Also reject a supplied Origin different from configured app origin; if Origin absent but Referer supplied, require same origin; allow both absent for non-browser HTTP clients only with valid token. Middleware accesses config through `req.authConfig`, set by attachSessionMiddleware. Login/register/logout call this middleware; all non-GET/HEAD/OPTIONS `/admin` requests call it after auth guard and method override. Do not compare against a newly issued cookie when no incoming cookie exists.
- `requireAdminAuth(req,res,next)`: require verified attached session; anonymous GET/HEAD -> 302 `/auth/login?next=<encoded sanitized original admin path>`; anonymous other methods -> 303 `/auth/login` without writes. Guard mounted with app.use('/admin', ...) before every existing admin handler.
- `createLoginRouter({ prisma, authConfig }) -> express.Router`: full real login implementation described below. Routers install requireCsrf themselves on their POST routes, so isolated tests enforce the same behavior.

### Frozen routes and adapters

All new routers mount at `/auth` and use EJS, not JSON. Express 4 async handlers catch and call next(error). All auth responses send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; authenticated admin pages are no-store. Shared session middleware supplies template `currentUser` and `csrfToken`; do not expose hashes or raw credentials in HTML/logs.

Registration module exports `validateRegistrationInput(body) -> {values:{email}, errors, password}` (never render returned password), `createSmtpMailer(env = process.env)`, `createRecaptchaVerifier(env = process.env, fetchImpl = globalThis.fetch)`, `createRegistrationRouter({ prisma, mailer, recaptchaVerifier, authConfig, logger = console })`.

Mailer returns `{isConfigured(), sendVerificationEmail({to,verifyUrl}):Promise<void>}`. Nodemailer SMTP transport, `SMTP_HOST`, port (default 587), boolean SMTP_SECURE, optional SMTP_USER/PASS, required SMTP_FROM. Missing/invalid config fails closed when sending, not a fake success; development local SMTP may omit authentication. Send Vietnamese text+HTML verification link, escape interpolated HTML, never log links/tokens/provider credentials. Configure connectionTimeout and socketTimeout 10000ms. Integrator installs current stable `nodemailer` once with `npm install nodemailer`; use resolved lockfile version rather than hard-coded stale recommendation.

CAPTCHA adapter returns `{isConfigured(),siteKey,verifyToken(token,remoteIp):Promise<{ok:boolean,reason:string|null}>}`. Google reCAPTCHA v2 checkbox, backend POST `https://www.google.com/recaptcha/api/siteverify`, URLSearchParams secret/response/optional remoteip, timeout 10000ms, check HTTP ok and JSON `success === true`. Missing/failed token reason `verification-failed`, absent token `missing-input-response`, missing keys `not-configured`, network/timeout/provider malformed response `network-error`. Require successful response hostname matches normalized APP_BASE_URL.hostname (ignore port); mismatch -> verification-failed. No bypass in application code. Test adapters may be injected explicitly.

- GET `/auth/register`: 200 register form `{title,values:{email:''},errors:{},recaptchaSiteKey}`; verified signed-in user ->302 `/admin/dishes`.
- POST `/auth/register`: CSRF first; validate email/password/confirmPassword, then CAPTCHA before DB writes. Invalid fields/token ->400 register form, provider unavailable/not-configured ->503; never echo password or CAPTCHA response. Verified existing email ->400 email-already-registered error. For a new email, hash password and create user+token in a Prisma interactive transaction. For an existing UNVERIFIED email, lock its User row using parameterized SELECT FOR UPDATE, reread verified status after acquiring the lock, and reject if now verified; otherwise replace its pending password hash, invalidate every unused prior verification token, and issue the new token in the same transaction. The new password becomes usable only after the matching new link is verified. Preserving an attacker-pre-registered password is forbidden. Verification acquires the same per-user lock, so no stale link can verify a newly replaced password, and a verified password can never be overwritten by registration. Treat concurrent new-user P2002 as 400 duplicate/retry, no 500. SMTP send happens after commit; failure returns503, leaves account unverified and permits same-email retry. Do not send mail inside an open DB transaction or automatically log in. Link `<appBaseUrl>/auth/verify-email?token=<64hex>`; DB holds hash only, expires after24h default. Successful send ->201 verify-result view pending; no session cookie.
- GET `/auth/verify-email?token=...`: malformed/missing, absent, expired, used ->400 result view invalid/expired; success ->200 result view with login link `/auth/login?verified=1`. No session. One transaction: look up token (including user), lock its user using parameterized SELECT FOR UPDATE, compute now AFTER lock acquisition, conditionally claim with `emailVerificationToken.updateMany({where:{id,usedAt:null,expiresAt:{gt:now}},data:{usedAt:now}})`; only count===1 then user.update emailVerifiedAt if still null. Zero count/transaction failure cannot partially verify or report success. Concurrent consume: exactly one success. For deleted/rotated token under a resend race conditional update count===0. View contract `{title,status,heading,message,actionHref,actionLabel}`; statuses pending/verified/invalid/expired.
- GET `/auth/login`: 200 form `{title,values:{email:'',next:sanitizeNextPath(query.next)},errors:{},notice}`; show fixed Vietnamese notices only for verified=1/loggedOut=1; already authenticated ->302 safe next.
- POST `/auth/login`: CSRF first; invalid fields ->400; unknown email/wrong password ->401 same generic message; correct password but unverified ->403 no session. Verified password success creates new session identity and removes only the old presented DB session if any, then303 safe next or `/admin/dishes`. Do not reuse attacker-provided session IDs. Form fields email/password/hidden next/hidden _csrf; never retain password.
- Logout module exports `createLogoutRouter({ prisma, authConfig }) -> express.Router`. POST `/auth/logout` runs requireCsrf; deleteMany session by hash of `req.auth.rawToken || req.cookies[sessionCookieName]` when valid format, then clear cookie, then303 `/auth/login?loggedOut=1`. DB deletion failure calls next(error), no success redirect or cookie-only successful logout. Valid anonymous CSRF + missing/already-deleted session returns same303 (idempotent); replaying old authenticated CSRF without valid anonymous CSRF may403, which is safe. GET `/auth/logout` unregistered ->404, never logs out. Other session rows unaffected.

### Configuration and integration

Keep existing DATABASE_URL/PORT config; append APP_BASE_URL=http://localhost:3001, SESSION_COOKIE_NAME=soucha_session, SESSION_TTL_HOURS=24, EMAIL_VERIFY_TTL_HOURS=24, SMTP_HOST, SMTP_PORT=587, SMTP_SECURE=false, SMTP_USER, SMTP_PASS, SMTP_FROM, RECAPTCHA_SITE_KEY, RECAPTCHA_SECRET_KEY to `.env.example`. Real secrets supplied privately; not committed. SMTP sender/domain and Google v2 site/secret registered for the actual hostname are external prerequisites. Production APP_BASE_URL must be configured as public HTTPS URL. Without providers, public menu/login can run; registration returns503, never fake verification.

Change factory to `createApp({prisma,logger=console,mailer,recaptchaVerifier,authConfig:authConfigOverrides} = {})` using injected or real providers. Resolve config once; real CAPTCHA factory receives `{...process.env,APP_BASE_URL:authConfig.appBaseUrl,RECAPTCHA_SITE_KEY:authConfig.recaptchaSiteKey,RECAPTCHA_SECRET_KEY:authConfig.recaptchaSecretKey}` so hostname/keys match overrides, not unrelated env. Existing body parser/methodOverride precede session middleware, then `/auth` no-store/no-referrer header middleware and all three routers, then `/admin` no-store/auth guard+CSRF before existing handlers/404/error. Preserve static middleware ordering before DB lookup. Header shows public menu+login/register when anonymous; authenticated menu+management+escaped email+POST logout form. Every existing POST form gets hidden `_csrf`: admin/form:3,delete:2,unlink:7,dish-detail:54,dish-ingredient-edit:14,chef-detail:40. Login/register/header logout forms include it; existing public GET search/sort forms do not. Existing createApp prisma/logger callers remain valid with optional injected arguments, not a compatibility shim.

Existing CRUD route coverage: generic dishes/chefs/ingredients list/new/create/edit/PATCH/delete-confirm/DELETE (`src/app.js:63-130`), dish detail and ingredient links CRUD (`:163-283`), chef detail and dish links (`:313-378`). Protect the prefix, not a hand-picked endpoint list. Unauthenticated writes never run restaurant Prisma operations. Keep current CRUD validation/redirect semantics when authenticated. Error logs preserve existing DB URL redaction and redact configured SMTP_PASS/RECAPTCHA_SECRET_KEY plus provider URLs; never print raw passwords/session/email tokens or provider request payloads.

## Verification

During current planning only source inspection is performed; none of the following implementation checks are claimed as run.

After shared foundation and three slices integrate, use existing `npm test` (`node --test tests/*.test.js`). Dedicated test files own their fixtures; do not race-edit shared fake Prisma. Fake auth delegates implement transaction callback, conditional update counts and rollback semantics where tested; real PostgreSQL smoke is required for locks/concurrency, not asserted from mocks. Update existing app tests with verified user/session fixtures and CSRF cookie/form handling while preserving CRUD assertions. Existing unauthenticated assumptions intentionally change.

Run `npm run db:generate`, then `npm run db:push` against explicitly provided disposable DATABASE_URL; execute `npm run test:live` after adapting it. Never seed or run destructive SQL against user data. Login plan must freeze a concrete new `AUTH_SMOKE_*` test-only fixture interface if needed; test config is injected, never production bypass.

Required observable scenarios: public pages still work anonymously; every `/admin` anonymous read redirects302 and write redirects303 without mutation; valid registration through a real browser v2 widget sends email to a controlled inbox, verification enables login but not automatic authentication; wrong/missing CAPTCHA and provider failures leave no verified account; unverified login403; verified login issues secure attributes and DB hash, then all entity and association writes work with CSRF and fail403 without it; DB-expired/deleted session fails; process restart with same DB and unexpired cookie preserves access; logout deletes only current DB row and captured cookie replay fails. Verify verification single-use concurrently with real PostgreSQL. Inspect browser UI of login/register/verification/header/logout; close browser tab. Unit tests with injected mail/CAPTCHA do not replace real-provider verification.

After implementation assign a separate medium-or-lower effort reviewer to inspect actual diff/security/ownership and relevant behavior; fix actionable findings, rerun affected smoke. Runtime external prerequisites missing at execution are reported precisely; complete all reachable tests, never claim real mail/CAPTCHA delivered without evidence.

## Assumptions and contingencies

Defaults are reCAPTCHA v2 checkbox, SMTP, 24-hour absolute session and verification lifetimes, current-session-only logout, and all verified accounts can manage existing CRUD (no new roles). User may override these before implementation; otherwise they are fixed. Same unverified email resubmission atomically replaces pending credentials and invalidates all prior unused links; verified-account password reset is not added. Plan mode stores deliverables only at local://; repository markdown copies are not created before approval.

If SMTP/Google keys or controlled inbox are unavailable, implement real adapters and run deterministic injected failure/success coverage, but mark real-provider smoke blocked with missing prerequisites. If no disposable PostgreSQL URL is available, finish fake-Prisma tests and report live persistence/concurrency verification blocked; never point schema push at an arbitrary existing database. No substitute JSON API, mock mail success, CAPTCHA bypass, or in-memory production session store.
