# Implementation plan — registration, CAPTCHA and activation OTP

Updated 2026-11-02. Planning only. Follow the [shared contract](auth-parallel-plan.md) and [acceptance matrix](auth-acceptance-checklist.md). Source slides 10–22, 49–51, 58–59; speaker notes prohibit overwriting a pending password on re-registration.

## Ownership and prerequisites

Feature owner: new restaurant/src/auth/registration.js, views/auth/register.ejs and activate.ejs, tests/auth-registration.test.js. The integrator owns schema, dependencies, shared config/credentials/session/throttle/captcha/mail, router mounts and existing shared forms/tests. Build against those real helpers; do not duplicate them.

Schema prerequisites: User (original/normalized email, viewer role, pending/active status), ActivationChallenge with purpose/hash/expiry/attempts/lock/sent/used fields, ActivationAttempt per normalized email for existing and nonexistent accounts, shared request counters and CSRF sessions. SMTP and a matching Google CAPTCHA adapter are external prerequisites for live proof.

## Implementation steps

1. GET /register renders email/password/confirmation, CSRF and CAPTCHA action register. GET /activate renders email/OTP and a separate POST resend form, both with CSRF. Never render submitted password or newly generated OTP.
2. POST /register applies email/IP request limits and CSRF/validation, then verifies CAPTCHA at backend before password hashing, user writes or sending OTP. Use the published normalization/validator and ignore role/status/verified fields from body.
3. Apply the common activation-mail dispatch cooldown/bucket for every normalized email before branching on existence, including active/unknown addresses. Repeated register and resend must not bypass each other's mail limits or disclose existence through 429 differences.
4. For a new email, hash the password with Argon2id, generate a six-digit OTP via CSPRNG, hash it and transactionally create pending User(role=viewer) plus challenge. Race on unique email must converge on the same generic response/pending-resend rules, not expose a duplicate exception.
5. For existing pending user, preserve passwordHash and follow the same resend operation and limits. Existing active user is not modified and receives the same 200 message. Rate-limited requests return 429 regardless of existence. Invalid input is 200 VALIDATION_FAILED.
6. After commit return a generic 200 and dispatch SMTP asynchronously as defined in the contract. OTP goes to email only, never log/response/hidden field. Delivery failure leaves pending, logs sanitized technical failure and allows later resend; no fake delivery confirmation.
7. POST /activate: request limiter, CSRF, then transaction locking ActivationAttempt by email first and User/challenge if present. Re-read status/purpose/expiry/used/lock and verify OTP. Conditional claim plus active/emailVerifiedAt/usedAt must commit together. Wrong/expired/used/missing challenge uses 200 INVALID_OTP; increment the per-email attempts for pending/active/unknown alike, mirroring into an existing challenge without changing account status. Locked or threshold-reaching request is 429. Only one concurrent correct request succeeds.
8. POST /activate/resend: common rate/cooldown and ActivationAttempt lock for every email, CSRF, then the same email-before-User lock order and re-read pending status. Replace OTP only for pending, preserve attempts/lockedUntil. Locked pending/active/unknown addresses all return 429; never condition 429 solely on a real challenge row. No password change. Lock expiry is the only budget renewal event; resend itself never clears failures. Register uses this same gate and a new challenge inherits any prior email failure budget.
9. After successful activation show login link, keep only any anonymous CSRF session, and do not issue an authenticated session. Active user replay returns INVALID_OTP without reverting status. An activation OTP is never accepted as password, session id or reset credential.

## HTTP/DB tests

Use the real route/helpers with isolated fake adapters for deterministic HTTP tests; use PostgreSQL transactions for concurrency proof.

- New registration pending/viewer/hash and actual captured outbound test mail; body role=admin/status=active ignored.
- New and existing email have identical success status/message; re-register pending leaves the original passwordHash unchanged.
- Missing/invalid/reused/expired/wrong-action CAPTCHA cannot create user or send OTP; provider failure is technical 500.
- Activation wrong/expired/used/purpose mismatch/unknown yields generic INVALID_OTP; no activation/session.
- Correct OTP atomically sets active, emailVerifiedAt and usedAt; replay fails; two concurrent claims have one winner.
- Resend invalidates old OTP; cooldown and per-email/IP budgets cover direct register/resend calls; attempts and lockedUntil persist despite resends.
- Interleave resend and activate under real DB concurrency; never activate with an obsolete generation or reset the failure budget.
- Pending login is denied, activation does not authenticate, active login needs the original valid password.
- Test pending/active/unknown parity: submit five invalid OTPs for each, then resend/re-register after ordinary cooldown but before lock expiry; all receive 429. Include original/normalized email cases.

Live evidence uses controlled inbox, real fresh CAPTCHA token, OTP entry, relevant DB states and redacted UI/Network. Provider mocks cannot prove Google or SMTP delivery. Record checklist R01–R08 and C01–C07. Do not send mass requests to external providers; use isolated adapters for repeated lock tests.
