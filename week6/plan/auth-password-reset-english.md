# Implementation plan — forgot/reset password

Updated 2026-11-02. **New required feature plan**, not optional scope. Follow [shared contract](auth-parallel-plan.md). Source slides 39–46, 55, 61 and speaker notes.

## Ownership and foundation

Feature owner creates restaurant/src/auth/password-reset.js, views/auth/forgot.ejs, reset.ejs and tests/auth-password-reset.test.js. Integrator owns PasswordReset schema, User lock convention, session helpers, shared limits/mailer, route/header integration and README.

Use User + PasswordReset + Session and the shared normalized-email policy. Configure trusted APP_BASE_URL and SMTP through env. Token is 32 random bytes with hash only in DB, 15-minute lifetime, usedAt and invalidatedAt. No account change before a valid reset POST.

## Routes and implementation

1. GET /forgot renders email and CSRF, accessible anonymously.
2. POST /forgot enforces common email/IP quotas and CSRF/input rules. Valid email gets identical 200 message/status regardless of account existence. Allocate limiter buckets for all emails; no existence-based 429 differences.
3. For an existing user, lock User, invalidate all unused reset tokens and insert a fresh hashed token transactionally. Treat pending and active consistently: pending can change password but remains pending and still needs activation. No password/session changes at issuance.
4. Build HTTPS production link from configured APP_BASE_URL, never arbitrary Host; dispatch email asynchronously after generic response as shared contract describes. Never return the issued raw token to the requesting browser or log it. No-account branch also returns generic response; assess timing, not text alone.
5. GET/HEAD /reset?token=... first applies the published IP quota shared with POST /reset (20 requests/15 minutes); excess requests get 429 before token lookup. Then validate format/hash/expiry/usedAt/invalidatedAt and display password/confirmation form or generic invalid-link result. **GET does not consume the token**, change password, invalidate other tokens or revoke authenticated sessions. Form may carry back the token already supplied in the emailed URL. Set no-store and no-referrer, and avoid third-party resources on the reset page.
6. POST /reset applies request limiter, CSRF, password policy and token validation. Hash new password using the shared library. Under a User-locked transaction re-read token validity and conditionally claim it; atomically update passwordHash, set usedAt, invalidate all other unused reset tokens and delete **all** user sessions. Rollback every change on failure. Neither role/status nor emailVerifiedAt is changed.
7. On success clear the browser session cookie only if it refers to a revoked session of that user; never claim a different signed-in account was revoked. Redirect 303 /login and send a notification email without password. No automatic login. If notification delivery fails after commit, report/log it appropriately without undoing the password change.
8. Invalid/expired/used/invalidated token: common 200 INVALID_RESET_TOKEN and no mutation. Locked-rate request: 429; CSRF: 403; infrastructure failure: 500. A new forgot request invalidates the old link even if it has not expired.
9. Enforce purpose separation: reset token cannot serve as login password, activation OTP, sid or permission to CRUD. Reset must not clear login throttles or activate a pending user. Login rechecks current password under the same User lock to block an old-password login race.

## Tests and evidence

- Email present/absent: same 200 content/status and same limits, no response token. Technical/provider failure path does not fake successful delivery.
- Too many forgot requests: 429 by server, including direct HTTP and new browser cookies.
- Opening valid reset GET: usedAt stays null, password and sessions unchanged; repeated GET also safe. Exceed the shared GET/HEAD/POST IP quota: 429 without consumption or password/session changes; POST cannot bypass a spent GET budget.
- Wrong, expired, used, superseded token: no password mutation.
- Bad password/confirmation or CSRF: no token consumption.
- Successful reset: password hash changed; token usedAt set; prior reset tokens invalidated; all sessions A/B revoked; no auto-login.
- Replay old sid and old password fail; new password works only through normal active-account login including CAPTCHA/limits.
- Pending reset leaves pending; session not granted.
- Two concurrent reset POSTs have one winner; concurrent new-token issuance/reset obey User lock order; racing login cannot keep a session issued from obsolete credentials.
- Rollback injected failure: password/token/session states are all unchanged.
- Evidence F01–F08: controlled inbox, redacted link, GET/POST Network, DB before/after, captured sid replay; real DB for transaction/concurrency proof. Mocks do not prove email delivery.

Missing SMTP or disposable DB is a documented verification prerequisite, not justification to omit the required feature.
