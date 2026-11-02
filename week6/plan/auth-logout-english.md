# Logout: current-session revocation

## Current context

Companion contract: local://auth-parallel-plan.md (Vietnamese), local://auth-contract-english.md (English authority). The existing CommonJS Express/EJS app uses injected Prisma (`restaurant/src/app.js:16-27`) and HTTP tests with a fake Prisma (`restaurant/tests/app.test.js:18-135`). Logout is a separate parallel slice after the login owner's real shared foundation barrier. No code or runtime check is performed by this plan.

## Required functionality

POST-only logout invalidates the current PostgreSQL session before expiring its cookie. A captured pre-logout cookie cannot regain admin access; other sessions for the same user remain valid. CSRF and origin checks apply. Database failures must not be reported as successful logout.

## Overall implementation approach

### 1. Observe the ownership barrier

Exclusively create `restaurant/src/auth/logout.js` and `restaurant/tests/auth-logout.test.js` (both proposed paths). Do not edit app.js, schema, header, session.js, manifests or shared tests. Begin after the integrator supplies real `hashToken`, `clearSessionCookie`, `requireCsrf`, `attachSessionMiddleware` and schema from the shared contract. Router mounting and header logout form remain login owner work. Do not introduce independent cookie or session implementations.

### 2. Implement the complete router

CommonJS export `{ createLogoutRouter }`, signature `createLogoutRouter({ prisma, authConfig }) -> express.Router`. Import Express and `requireCsrf`, `hashToken`, `clearSessionCookie` from `./session`. Register only `router.post('/logout', requireCsrf, asyncHandler)`, mounted at `/auth` by integrator. Catch async errors and call next(error), as required by Express 4.

Resolve `rawToken = req.auth.rawToken || req.cookies[authConfig.sessionCookieName]`. For a string matching `/^[0-9a-f]{64}$/`, await `prisma.session.deleteMany({where:{tokenHash:hashToken(rawToken)}})`. Count zero is successful, never delete by userId. When no valid token is presented, skip deletion. Only after deletion succeeds (or is unnecessary), call `clearSessionCookie(res, authConfig)` and `res.redirect(303, '/auth/login?loggedOut=1')`. The shared helper appends HttpOnly/Path=/;SameSite=Lax, conditional Secure, Max-Age=0 and epoch Expires with the same cookie name/path as login.

On deletion failure call next(error), do not clear or redirect from this handler. Earlier session middleware may independently clear an expired/invalid cookie; deletion-failure checks must use a valid authenticated session. GET `/auth/logout` remains unregistered and falls through to404. No logout-all, GET side effects or new view. Auth responses inherit no-store/no-referrer integration. Do not log token/hash/CSRF values.

### 3. Define anonymous and replay behavior

Valid anonymous cookie-CSRF plus matching `_csrf` permits idempotent303 with missing/already-deleted session. A stale authenticated `_csrf` does not become valid anonymous CSRF: replay without a matching anonymous cookie may403. Missing/mismatched/malformed CSRF or cross-origin Origin/Referer is403 before deletion. A DB outage is500 through existing error handling, not a cookie-only successful logout.

## Verification

Write `tests/auth-logout.test.js` with node:test, strict assertions and an ephemeral real HTTP server following `tests/app.test.js:18-135`; use real shared session/CSRF/auth-guard functions and this router with a private fake session delegate, not shared fixture edits. Assert consumer-visible transitions:

- Valid authenticated POST ->303 exact Location, deleted A hash row, expired session cookie attributes; protected request with captured A cookie now302 login. Session B for the same user still gets200 and its DB row remains.
- Hold the deletion promise: client receives no success response until deletion resolves. Reject it:500, no success Location, no logout cookie expiry for the valid attached session, A remains accessible. This verifies revocation-before-success, not source wiring.
- Missing/wrong/malformed CSRF and different Origin ->403, original session still works; valid same-origin and absent Origin/Referer with correct token are allowed.
- Anonymous valid CSRF with no session, malformed session, or already-deleted session ->303 without creating or deleting another session. Former authenticated CSRF without matching anonymous cookie ->403.
- GET with valid session ->404 and subsequent protected read still200. Responses do not include credentials/tokens and integrated auth responses have no-store/no-referrer.

After all slices land, coordinator runs from `restaurant/`: `node --test tests/auth-logout.test.js`, then `npm test`. Prerequisite for real DB proof: explicitly supplied disposable PostgreSQL DATABASE_URL, generated client and pushed schema, integrated running server with matching APP_BASE_URL, privately available verified test-account credentials. Do not seed or use arbitrary user data.

Concrete real-server scenario: log in twice in two isolated browser cookie jars; confirm both access `/admin/dishes`. Privately capture A's raw session cookie and derive its SHA-256 hash without printing it. Inspect matching DB rows. Submit A's rendered header POST with `_csrf` ->303 `/auth/login?loggedOut=1` and expired cookie; query confirms A absent, B present. Replay captured A cookie with redirects disabled ->302 `/auth/login?next=...`; B still200. Restart same server against same DB ->B still200. Repeat logout with fresh anonymous CSRF ->303. Deterministic fake-DB rejection covers exact delete-failure ordering without deliberately disrupting a shared database.

Run the integrator's adapted live harness from `restaurant/`: `LIVE_SMOKE_ALLOW_DB_WRITE=1 npm run test:live`, with DATABASE_URL pointing only at a disposable DB and APP_BASE_URL/config as specified in login plan. Obtain separate medium-or-lower effort code review after implementation, fix findings, rerun affected smoke. None of these runtime checks has been run during planning.

## Assumptions and contingencies

Current-session-only revocation and shared CSRF/cookie configuration are fixed. If disposable PostgreSQL is missing, complete deterministic HTTP tests and report live persistence/replay proof blocked. Missing SMTP/Google keys or inbox blocks real-provider registration smoke, not reachable logout coverage. Integration/header/live harness are exclusively login owner tasks, not additional logout file edits.
