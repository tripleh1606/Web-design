# Shared SSR authentication contract — English reference

Updated 2026-11-02. Planning only. The [Vietnamese shared contract](auth-parallel-plan.md) is authoritative for all feature plans. The source is the supplied “Xác thực tài khoản trên SSR.html”, including speaker notes; [acceptance checklist](auth-acceptance-checklist.md) maps the requirements to slides. This replaces the previous link-verification contract.

## Scope and shared foundation

Extend the existing CommonJS Express 4/EJS/Prisma/PostgreSQL restaurant app. Required features are registration with CAPTCHA and email OTP, persistent session login with brute-force controls, logout with protected CRUD, and forgot/reset password. All active accounts can use the management CRUD in this block, including role viewer; role-based permission rules belong to a later block.

All existing restaurant data routes require authentication: GET /dishes, GET /dishes/:id and every /admin route (reads, forms, mutations, associations). Slide 54 gives no public-menu exemption. Required auth forms/routes and static assets remain accessible anonymously. Anonymous/invalid/expired/pending requests receive **303 Location: /login** before CRUD queries or mutations. Static assets remain public. No new JSON API, JWT, social login or MFA.

One integrator owns schema, shared helpers, app/server wiring, configuration, dependencies, header/admin forms and shared tests. Feature owners use the same helpers. Build the real shared foundation before feature handoff. Do not mount missing router modules or introduce mock production helpers.

## Persistence and policy

Use the model/field table and exact project policy values in sections 2–3 of the shared contract. In particular:

- User includes original and normalized email, passwordHash, server-assigned role=viewer, status=pending/active, emailVerifiedAt. Trim email and lowercase domain; preserve local-part; use a tested email validator. Do not allow input to set status, verification or role.
- ActivationChallenge includes unique userId, purpose=activation, otpHash, expiresAt, attempts, lockedUntil, lastSentAt and usedAt. Preserve consumed metadata for evidence.
- PasswordReset includes userId, tokenHash, expiresAt, usedAt, invalidatedAt and createdAt. New requests invalidate prior unused tokens.
- Session stores sidHash (SHA-256 of random opaque sid), nullable userId for anonymous CSRF sessions, csrfToken, createdAt, lastSeenAt and absolute expiresAt. Only an unexpired session linked to an active verified user authenticates. Anonymous cookies do not prove login.
- ActivationAttempt tracks failed OTP attempts/locks by normalized email for pending, active and nonexistent accounts alike; mirror its values into ActivationChallenge when present. Register/activate/resend consult the same state. LoginAttempt and RateLimitBucket store server-side counters/locks by normalized email and IP. They must be concurrency-safe and apply to nonexistent emails too.
- Argon2id via a maintained password library; CSPRNG for OTP/session/reset tokens. Use password hash APIs for passwords, not a fast digest. No plaintext OTP/reset token persistence or logging.

Canonical defaults: six-digit OTP/10-minute lifetime/five failures/15-minute lock/60-second resend cooldown; login three failures requires CAPTCHA, ten failures locks five minutes in a 15-minute window; reset 15 minutes; session idle 30 minutes/absolute 24 hours. Other endpoint/IP limits are in the shared policy table. These are declared project choices, not compulsory numeric values from the slides.

The user selected Google reCAPTCHA **v2 Checkbox**. Registration always requires it; login requires it after three failures, according to server counters. Verify the proof and hostname through siteverify; Google enforces expiry and single use. V2 has no action/score. The helper's server-selected purpose is route context only, not a Google-attested action or per-form token binding. Never trust browser captchaPassed/action/score. Provider outage fails closed, without clearing counters or overriding locks.

Auth uses RECAPTCHA_V2_SITE_KEY/RECAPTCHA_V2_SECRET_KEY. If both values are absent/empty, use the complete existing LOGOUT_RECAPTCHA_V2_* pair for the same hostname. Once either auth value is supplied, require the complete auth pair; never mix partial pairs. Logout may retain its separate pair.

The source requires OTP, password-reset and password-changed emails; it does not mandate SMTP or an email vendor. Keep the existing Nodemailer SMTP transport as the project's delivery choice, independently of CAPTCHA. See [email setup](../restaurant/docs/email-setup.md). Missing configuration is a technical failure; neither console OTP nor simulated delivery completes live acceptance.

## Routes, responses and invariants

Use root paths /register, /activate, /activate/resend, /login, /logout, /forgot, /reset. No /auth prefix or GET email-activation endpoint.

- Register: common 200 for new/existing email; 200 VALIDATION_FAILED for bad input. Rate limit and CAPTCHA before hashing/creating/mailing. Existing pending registration preserves its password and follows resend limits. Role/status from body ignored.
- Activate: POST only; all six conditions (pending, correct purpose, unexpired, unused, budget available, matching hash) must hold. Wrong/expired/used/unknown returns 200 INVALID_OTP; throttling returns 429 RATE_LIMITED. Atomically set active, emailVerifiedAt and usedAt. No auto-login.
- Resend: common 200, generic for all emails, cooldown and limits apply regardless of existence. Replace OTP only for pending; do not reset attempts or lock. Re-registration and resend share dispatch limits.
- Login: shared limit/lock → CSRF/validation → required CAPTCHA → password/status → atomic session rotation → 303 /admin/dishes. Common 200 form error for unknown/wrong password is the project's choice. Pending with correct password gets activation notice but no authenticated session. Only successful session creation clears email failure count; retain IP limits.
- Logout (user extension): authenticated GET /logout/confirm renders a v2 Checkbox. POST requireLogin → CSRF → Google v2 verify → await deletion of current session row only → expire sid cookie → 303 /login. Other sessions survive. Invalid CAPTCHA preserves the session; provider/config/store errors return 500. GET /logout is 404. The module is integrated with the shared login/session helpers; real provider/store acceptance remains pending.
- Forgot: common 200 content/status for existing/nonexistent email, with rate limits for both. Queue lightweight asynchronous mail work after response; no SMTP-duration existence signal or raw token response.
- Reset GET/HEAD: apply the published IP quota shared with reset POST before read-only token validation/form; excess requests get 429 without token consumption or password/session changes.
- Reset POST: validate token in a User-locked transaction, update hash, consume usedAt, invalidate other resets, delete all user sessions; 303 /login and notification email; never auto-login or activate pending. Invalid token form uses 200 INVALID_RESET_TOKEN; errors are generic. Login must recheck passwordHash under the same User lock before creating a session.
- CSRF/origin failure: 403; rate limits: 429; technical failures: 500. Preserve error.code in the SSR view model, not a newly invented JSON API.

Register/activate/resend lock ActivationAttempt by email first, then User if present; unknown emails get the same failure-lock transitions. User-row locking and conditional updates serialize activate/resend and forgot/reset/login. Two requests consuming the same OTP or reset token cannot both succeed. No unprotected old credential may create a session after reset.

Cookie sid is HttpOnly, Path=/, SameSite=Lax, host-only, Secure over production HTTPS. Clear with the same scope. Regenerate on login; enforce both idle and absolute expiration in the store; expired/removed rows cannot be recreated by a lastSeenAt update. CSRF applies to all auth POSTs and management writes (including method override). Auth and protected data responses (/dishes and /admin) no-store; reset no-referrer and no external resources leaking the URL.

## Implementation and verification order

Follow [login/foundation](auth-login-english.md), [registration/OTP](auth-registration-english.md), [logout](auth-logout-english.md), [forgot/reset](auth-password-reset-english.md), then shared integration and [acceptance](auth-acceptance-checklist.md). Work can be sequential; parallel owners edit disjoint feature files after the shared foundation exists.

Add an explicit non-destructive auth seed script for one active account using env credentials, as requested by slide 49 notes. Never auto-activate or overwrite an existing pending account during seed. Do not use the restaurant seed if it clears data.

Use isolated HTTP tests plus disposable PostgreSQL for concurrency/persistence, and real browser/email/CAPTCHA checks. No live DB mutation or fake evidence during planning. Preserve code-generated-bug evidence and group-drawn diagrams required by slide 63. Existing tests have not passed in this checkout because dependencies are missing; runtime verification remains future work.
