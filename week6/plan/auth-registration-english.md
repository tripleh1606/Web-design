# Registration: email verification, SMTP and Google reCAPTCHA

## Current context

Shared contract: local://auth-parallel-plan.md (Vietnamese) and local://auth-contract-english.md (English authority). Existing Express/EJS conventions are in `restaurant/src/app.js:16-27`, admin form partials and `restaurant/tests/app.test.js:18-135`; PostgreSQL schema currently has no auth models (`restaurant/prisma/schema.prisma:1-68`). No new JSON API or restriction on public menu browsing is requested. This plan defines future implementation, not completed code/tests.

## Required functionality

Vietnamese registration form, CSRF and real Google reCAPTCHA v2 checkbox verified server-side, real SMTP verification email, hashed expiring single-use tokens, email activation before login. Verification never logs the user in. Unverified re-registration replaces pending credentials and invalidates previous links atomically; verified users cannot be overwritten. Provider/config/DB errors never fake success.

## Overall implementation approach

### 1. Ownership and dependencies

Create only `restaurant/src/auth/registration.js`, `restaurant/views/auth/register.ejs`, `restaurant/views/auth/verify-result.ejs`, `restaurant/tests/auth-registration.test.js` (new paths). The login integrator exclusively owns dependencies, schema/generated client, shared session helpers, app/server/config/header/shared test/live smoke edits. Begin after its real shared-foundation barrier; do not invent replacement crypto/config/CSRF helpers. Router mounting occurs after all three real modules exist. No shared tests/install/generation while siblings edit.

### 2. Validation and provider adapters

Export CommonJS `validateRegistrationInput(body)`, `createSmtpMailer(env = process.env)`, `createRecaptchaVerifier(env = process.env, fetchImpl = globalThis.fetch)`, `createRegistrationRouter({prisma,mailer,recaptchaVerifier,authConfig,logger=console})` exactly as contract. Use shared normalizeEmail/hashPassword/generateRawToken/hashToken/requireCsrf. Express4 async handlers catch and call next(error). Router responses have no-store/no-referrer, including forwarded errors through shared integration.

Validation returns `{values:{email},errors,password}`. Email trimmed/lowercased, max120, `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; password string8..128 inclusive, confirmPassword exactly equal. No password trim/Unicode normalization. Nonstring inputs invalid; never render password/confirmation/CAPTCHA response. Reuse existing EJS escaped fields/partials, not raw interpolation.

SMTP: return `{isConfigured(),sendVerificationEmail({to,verifyUrl})}`. Nodemailer dependency installed by integrator. SMTP_HOST and SMTP_FROM required; port integer1..65535 default587, SMTP_SECURE literal true/false defaultfalse; SMTP_USER/PASS optional together for real authenticated SMTP, local test SMTP may omit both. Missing/invalid config makes send throw, not succeed. Transport connectionTimeout/socketTimeout10000ms. Vietnamese text+HTML with escaped link/display values; never log raw links, tokens, provider payloads/credentials. Check isConfigured before DB writes; send failure after commit still leaves unverified retryable account.

CAPTCHA: return `{isConfigured(),siteKey,verifyToken(token,remoteIp)}`. Node global fetch with AbortSignal.timeout(10000), POST form-urlencoded secret/response/optional remoteip to `https://www.google.com/recaptcha/api/siteverify`. Require HTTP ok, well-formed JSON, `success===true`, hostname equals normalized application hostname ignoring port. APP_BASE_URL from env must match resolved app config; pass normalized base URL to adapter env in integrator rather than recomputing unrelated fallback. Return exact reasons missing-input-response/not-configured/network-error/verification-failed or success reason null. Reject before DB writes. No production bypass; injected adapters only in explicit tests.

### 3. Routes and transaction boundaries

GET `/auth/register`: authenticated verified user302 `/admin/dishes`; otherwise200 form locals `{title,values:{email:''},errors:{},recaptchaSiteKey}` plus shared csrfToken/currentUser.

POST `/auth/register`: requireCsrf first; invalid input ->400, CAPTCHA missing/failed ->400, unconfigured/unavailable CAPTCHA or SMTP ->503. Preserve normalized email only in errors. Check email: verified duplicate400. Hash password and generate fresh raw64hex token, store hash and expiresAt=now+emailVerifyTtlMs.

New account: interactive `prisma.$transaction(async tx => ...)` creates user with emailVerifiedAt null and token atomically; concurrent unique-email P2002 ->400 duplicate/retry, no500. Existing unverified account: lock user with parameterized Prisma tagged query `await tx.$queryRaw\`SELECT id FROM users WHERE id = ${userId} FOR UPDATE\``; reread user after lock. If now verified, reject400 without changes. Otherwise update pending passwordHash, delete all unused old tokens and create the new token, all in one transaction. No password overwrite after verification. Transaction errors roll back and go through error handler. Do not hold transactions open for mail.

After commit send `<appBaseUrl>/auth/verify-email?token=<raw64hex>` to normalized email. SMTP failure ->503 register form and no session; committed account remains unverified and another same-email registration can retry. Successful SMTP submission ->201 result view pending; report actual inbox delivery only after real-provider smoke. Verification lifetime defaults24h.

GET `/auth/verify-email`: missing/malformed raw token ->400 invalid. In one interactive transaction find token by hash including user; absent/used/expired ->400 invalid/expired. Acquire same parameterized user FOR UPDATE lock, then conditionally claim `tx.emailVerificationToken.updateMany({where:{id:record.id,usedAt:null,expiresAt:{gt:now}},data:{usedAt:now}})` using now after lock acquisition. Only count1 may set user.emailVerifiedAt (if still null); count0 returns400. Rollback on failure prevents partial claim/verification. Success200 result with `/auth/login?verified=1`, no session. Exactly one concurrent consume succeeds. If resend wins the lock, old token is deleted and claim fails; if verification wins, resend's post-lock reread rejects credential change.

### 4. Views

`register.ejs`: Vietnamese email/password/confirmPassword inputs, hidden `_csrf`, real v2 checkbox `<div class="g-recaptcha" data-sitekey="<%= recaptchaSiteKey %>"></div>` and `https://www.google.com/recaptcha/api.js` async/defer script. Escaped field/general errors, no retained password values. Keep existing partial/class conventions; no shared CSS edits by this slice.

`verify-result.ejs`: exact locals `{title,status,heading,message,actionHref,actionLabel}`; statuses pending/verified/invalid/expired. Pending explains inbox delivery/verification requirement; verified offers login; invalid/expired offers registration again. Escape text/URLs, never display raw query token. Integrator supplies shared response headers and template locals.

## Verification

Planning performed source inspection only. After all slices integrate run from `restaurant/`: `node --test tests/auth-registration.test.js`, then shared `npm test`. Use node:test HTTP style with private fake Prisma/transaction rollback and explicitly injected mail/CAPTCHA adapters; do not alter shared fixture files. Keep tests focused on behavior: invalid field boundaries and CSRF stop writes/mail; CAPTCHA reject/hostname mismatch/timeout/malformed result503 as appropriate; unavailable mail503; new account unverified with hashed password/token and no session; duplicate400; resend old link invalid, new password not usable before matching verification; valid link200 once, unknown/used/expired400; DB failure rollback; verification does not authenticate; password login only after activation. Inject fetch failures at provider boundary, not mock echoes of internal wiring. Inspect actual rendered form for widget and no password retention as browser smoke, not brittle source-text assertions.

Real PostgreSQL proof belongs in integrator-owned live smoke on an approved disposable DATABASE_URL, generated/pushed schema and `LIVE_SMOKE_ALLOW_DB_WRITE=1`. Two concurrent real HTTP verification requests for one run-owned token -> exactly one200 and one400, one verified account. Real DB sequential resend-before-old-verify and verify-before-resend check the lock contract's observable outcomes; additionally simultaneous resend/verify must yield only one consistent serial order, never a verified user with a password introduced after token claim. Use injected test adapters in the test child process only; production server never exposes a bypass. The login plan freezes the exact harness setup and commands. Do not seed.

Real-provider browser prerequisites: integrated running server with matching APP_BASE_URL, v2 checkbox keys registered for exact hostname, reachable SMTP with authorized sender, controlled inbox. Solve real widget, submit, observe201 then actual email arrival, follow URL ->200 without authenticated admin access, then log in with matching password. Missing/invalid CAPTCHA cannot create verified account. Confirm expired/replayed link fails. Inspect register/result/login/header/logout UI; close tab. No claim of email delivery or Google success from injected tests. Separate medium-or-lower reviewer inspects final diff/security, fixes are followed by affected smoke.

## Assumptions and contingencies

Shared defaults: SMTP, v2 checkbox,24h expiry, verified accounts may manage CRUD, no automatic login/roles/password reset. Missing SMTP/Google keys/inbox blocks only real-provider smoke; implement real adapters and finish deterministic coverage, explicitly report unavailable proof. Missing approved disposable DB blocks live locking/persistence proof, not reachable fake-Prisma tests. Never use an arbitrary user database, fake mail success or production CAPTCHA bypass.
