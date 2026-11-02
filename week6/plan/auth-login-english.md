# Login: persistent cookie sessions and protected existing CRUD

## Current context

Shared contract: local://auth-parallel-plan.md (Vietnamese), local://auth-contract-english.md (English authority). Source-grounded stack is CommonJS Node>=20, Express4/EJS, Prisma6.12/PostgreSQL (`restaurant/package.json:1-29`). `restaurant/src/app.js:16-402` mixes public menu with unguarded SSR/form admin routes. Existing HTTP fake-Prisma tests and live smoke assume unauthenticated admin access. The user selected protecting those existing endpoints, not building JSON APIs. This document describes future implementation; no tests/runtime have been executed during planning.

## Required functionality

Only verified accounts with unexpired DB-backed sessions may access any `/admin` page/write. Cookies contain opaque random tokens; DB stores their SHA-256 hashes and CSRF state. Login creates fresh identity, survives process restart via PostgreSQL, and applies absolute24h default expiry. All admin writes require CSRF including method override and relationship operations. Public browsing stays anonymous. Registration and logout integrate through exact shared modules without file-write overlap.

## Overall implementation approach

### 1. Foundation, parallel work and integration barriers

This owner is the sole shared-file integrator. Before siblings depend on shared code: install current stable Nodemailer once (`npm install nodemailer`), update lockfile, append exact three Prisma models from shared contract and run `npm run db:generate`, implement every exported shared utility/middleware plus complete login router in proposed `restaurant/src/auth/session.js`. Module must not import registration/logout. No temporary stubs/routes. Do not edit app.js to require missing sibling modules. This is the foundation barrier; never run shared installs/generation concurrently with edits.

After barrier, registration and logout implement their exclusively owned modules/views/tests while integrator finishes login views, existing forms/config/tests. After all real modules exist, mount them and run verification once. Exclusive login ownership: session.js, views/auth/login.ejs, tests/auth-session.test.js (new); package.json/lockfile, .env.example, prisma/schema.prisma, generated/prisma/**, server.js, src/app.js, views/partials/header.ejs, views/admin/{form,delete,unlink,dish-detail,dish-ingredient-edit,chef-detail}.ejs, tests/app.test.js, tests/live-smoke.js (existing, all below restaurant/). No edits to registration.js/register.ejs/verify-result.ejs/auth-registration.test.js or logout.js/auth-logout.test.js. No unrelated CSS work.

### 2. Schema, shared APIs and configuration

Append contract's `User`, `Session`, `EmailVerificationToken` models literally, keeping existing restaurant models. Use db:push workflow already present, not a new migration convention. User.email unique normalized; sessions contain unique tokenHash, csrfToken, user relation, expiresAt; verification tokens unique tokenHash, user, expiresAt/usedAt. Cascade user deletion and indexes exactly contract. No raw passwords/tokens in DB.

Implement complete CommonJS exports in session.js: resolveAuthConfig, normalizeEmail, hashPassword, verifyPassword, generateRawToken, hashToken, safeEqualToken, parseCookies, serializeCookie, setSessionCookie, clearSessionCookie, sanitizeNextPath, createSessionForUser, attachSessionMiddleware, requireCsrf, requireAdminAuth, createLoginRouter. Exact signatures/formats are frozen in shared contract; callers registration/logout reuse them, not copies.

Key invariants: async built-in scrypt16-byte salt/64-byte key,N16384/r8/p1 with exact UTF-8 password; stored `scrypt$<32hex>$<128hex>`, timingSafeEqual; unknown login uses one valid precomputed dummy hash. Raw tokens32 random bytes ->64lowerhex; SHA-256 hashes. Duplicate cookie names invalidated, malformed decode ignored. Cookies appended rather than replacing existing Set-Cookie; host-only HttpOnly/Path=/;SameSite=Lax, Secure in production/HTTPS, issue absolute TTL, clear Max-Age=0 and epoch Expires. Anonymous CSRF cookie soucha_csrf has7200seconds. safe next allows only exact /admin or /admin/ descendant, <=200chars, no protocol-relative/backslash/control/encoded separators; drop _method from target search, fallback/admin/dishes.

Resolve config once; validate HTTP(S) root base URL and positive finite integer-hour TTLs; invalid provided values throw at startup. Preserve DATABASE_URL/PORT and add to .env.example:

```dotenv
APP_BASE_URL=http://localhost:3001
SESSION_COOKIE_NAME=soucha_session
SESSION_TTL_HOURS=24
EMAIL_VERIFY_TTL_HOURS=24
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
```

APP_BASE_URL defaults to http://localhost:${PORT||3001}; production requires explicit public HTTPS origin. Missing provider keys does not stop public/login startup; registration fails503. Pass normalized resolved origin to CAPTCHA adapter env so hostname validation matches actual appBaseUrl, including injected test config. Real secrets supplied privately. Do not add env flags disabling production auth/CAPTCHA.

### 3. Session, CSRF and login behavior

attachSessionMiddleware initializes req.auth/req.cookies/req.authConfig, safe template currentUser and csrfToken. Valid-format session cookie ->findUnique tokenHash include user. Only unexpired row with verified user authenticates; use persisted csrfToken. Clear malformed/missing-in-DB/expired/unverified presented cookie, delete expired row by hash if needed. DB errors next(error), not anonymous fallback. Unauthenticated auth GET gets/reuses valid incoming anonymous CSRF cookie or generates one; render same value, but POST validation only accepts incoming cookie, never newly minted state. Static requests remain before this DB middleware.

requireCsrf compares _csrf to authenticated session token or incoming anonymous cookie; missing/mismatch/malformed403 error view. Configured-origin comparison rejects foreign Origin or, absent Origin, foreign Referer. No headers allowed only with valid token. Router POST handlers install requireCsrf themselves. After methodOverride the /admin prefix guard precedes write-CSRF; unauthenticated GET/HEAD302 login?next=encoded safe original path, other methods303/login without mutation. Guard covers all prefix routes, not selected resource handlers.

GET/auth/login ->200 `{title,values:{email:'',next:safeNext},errors:{},notice}`; only fixed verified=1/loggedOut=1 notices. Authenticated302 safe next. EJS email/password/hidden next/hidden _csrf; normal escaped interpolation, no retained password.

POST/auth/login CSRF first. Email shared format/max120, password nonempty and max128; invalid400. Query normalized email; verify supplied or dummy hash; unknown/wrong401 same Vietnamese message. Correct but unverified403 and no session. Successful verified credentials rotate only presented existing session: in one Prisma transaction delete old row by its presented token hash if any, then call createSessionForUser with transaction delegate as prisma and omit optional res. Unrelated sessions remain. After commit call setSessionCookie with returned rawToken and real res, then303 sanitized next/default/admin/dishes. Transaction failure issues no new session cookie or successful-login redirect and does not partially delete the old row. Never replay a write.

### 4. Shared app and existing form integration

Change factory to `createApp({prisma,logger=console,mailer,recaptchaVerifier,authConfig:authConfigOverrides} = {})`. Read references before exported signature changes using LSP if available; keep current callsites using prisma/logger valid via optional injections. Resolve config, existing static parser/method override order; session middleware; `/auth` no-store/no-referrer headers and routers registration/login/logout; `/admin` no-store/auth guard/write-CSRF; existing public/admin routes and404/error. Headers must apply to auth errors and unregistered GET/auth/logout too. Wire adapter defaults real SMTP/Google; injected tests explicit only. Keep server database requirement/shutdown behavior; validate production origin at startup.

Header always public menu; anonymous login/register links; authenticated management + escaped email + POST/auth/logout form with_csrf. Add hidden `<input type="hidden" name="_csrf" value="<%= csrfToken %>">` to all existing POST forms at admin/form:3,delete:2,unlink:7,dish-detail:54,dish-ingredient-edit:14,chef-detail:40 (restaurant/views/). Public GET search/sort unchanged.

Prefix coverage includes generic dishes/chefs/ingredients list/new/create/edit/PATCH/delete confirmation/DELETE (`src/app.js:63-130`); dish detail and ingredient link add/edit/PATCH/delete (`:163-283`); chef detail and dish link add/delete (`:313-378`). Preserve authenticated CRUD validation/redirects. Existing error handler redacts DB URLs; additionally redact SMTP_PASS/RECAPTCHA_SECRET_KEY/provider URLs and never log raw tokens/password/provider payload.

### 5. Adapt tests without losing existing CRUD assertions

Create dedicated tests/auth-session.test.js private fake Prisma/HTTP fixtures. Cover actual login/session/CSRF/auth boundaries, format/expiry and redirect safety; avoid permanent source-text/wiring/incidental-default tests. Update tests/app.test.js fake Prisma with verified user/session delegates; carry cookies and _csrf from rendered pages. Retain existing CRUD/search/validation/error/escaping assertions but authenticate admin operations. Add anonymous302/303 no-mutation and authenticated wrong-CSRF403 across all entity and relationship families. Registration/logout retain their own fixtures and tests, not simultaneous shared edits.

## Verification

After all edits finish, from restaurant/: `npm run db:generate`, `npm test`. Dedicated targeted command `node --test tests/auth-session.test.js tests/app.test.js`. Verify invalid/wrong/unverified credentials400/401/403, session fixation rotation, independent sessions, configured cookie attributes, expired/deleted rows rejected, DB errors not anonymous, malformed/duplicate cookie safety, next values external/encoded/admin-lookalike rejected, missing/foreign-origin CSRF403 and no writes. Authenticated standard POST and method-overridden PATCH/DELETE must retain existing CRUD semantics.

### Disposable live harness: exact interface and process restart

Implement in existing tests/live-smoke.js only; no seed and no external test-account prerequisite. Require operator-supplied disposable DATABASE_URL and LIVE_SMOKE_ALLOW_DB_WRITE=1 before any fixture write. Missing either ->explicit failure, not skip/fallback. Flag is permission acknowledgement, not automatic detection that DB is disposable; operator must provision it explicitly before db:push. Use one random run ID/email under.invalid and in-memory password, create verified and unverified fixtures through real Prisma/shared hashPassword, and record every created primary key. Reuse valid restaurant field payloads from existing app.test.js/schema/validation rather than guessing new model fields. Replace dependence on preseeded Matcha/Houjicha rows with own records. Do not invoke seed/reset/truncate/broad delete.

Parent selects a free loopback port. Spawn `node tests/live-smoke.js` with env `AUTH_SMOKE_CHILD=1`, `AUTH_SMOKE_PORT=<selected port>`, same DATABASE_URL and explicit consent; IPC enabled. Child constructs real Prisma/createApp, injects authConfig with loopback appBaseUrl and cookieSecure=false for this test only, reports ready over IPC, closes server/disconnects on stop message. Child mode lives only in test script, never production server. Parent uses readiness/exit timeout10000ms, hard-kills failed child if needed and reports error. On port conflict choose a new port once before any restart scenario; after cookies are captured preserve same port or fail rather than claim restart proof.

To exercise registration without external providers in automated DB smoke, child injects an explicit deterministic CAPTCHA adapter accepting only in-memory per-run sentinel and a collecting mailer. Parent provides sentinel by private IPC startup message, never env/log/HTTP control endpoint. Outgoing verification URLs can be returned privately via IPC; never print secrets. These test adapters exist only in tests/live-smoke.js; production createApp defaults remain real. Actual provider acceptance remains separate below.

Parent maintains real cookie jars and parses_csrf from rendered forms, manual redirects. Assert public list/search/detail/invalid ID/static asset anonymously, anonymous read302/write303 no-mutation across entity and association families. Login wrong401/unverified403/verified303; DB row stores hash, issued cookie attributes correct. Exercise dishes/chefs/ingredients create/edit/delete and dish-ingredient add/edit/remove, chef-dish add/remove with real DB effects. Missing/wrongCSRF or foreign origin403 with no mutation. Expire one row/delete another ->captured cookies no longer authenticate.

Keep a valid session cookie, stop and await child exit, start NEW child PID with same DB+port, retained cookie ->200/admin/dishes. This must be actual process restart, not recreating createApp. Two sessions A/B for same user: POST logoutA deletes onlyA, capturedA read302/write303, B remains200 even after restart. GET logout404. Inspect actual UI separately.

Registration DB scenarios: create run-owned verification token and send two concurrent HTTP consumes ->exactly one200/one400. Resend before old-link consume ->old400/new200 with replacement-password login only after new verify. Verify first then resend ->400 duplicate and original verified credentials unchanged. Simultaneous resend/verify must match one of those serial outcomes, never verified credentials different from the successfully claimed generation. Use real row locking and transactions, not mock claims. All created auth/restaurant/link rows tracked by IDs. In finally stop child, delete only run-owned association/session/token/user/restaurant records in dependency order, disconnect; cleanup failure is failure.

Operator commands after confirming DATABASE_URL identifies a disposable DB:

```sh
cd restaurant
export DATABASE_URL='<dedicated-disposable-postgresql-url>'
npm run db:generate
npm run db:push
npm test
LIVE_SMOKE_ALLOW_DB_WRITE=1 npm run test:live
```

Do not db:seed. Public production APP_BASE_URL/HTTPS cookie checks are separate from loopback test config. Real provider smoke requires reachable SMTP/sender, controlled inbox, v2 keys for exact browser hostname and matching APP_BASE_URL. In browser solve real CAPTCHA, submit registration, observe actual email, verify link without automatic login, login/admin CRUD/logout, inspect cookies and rendered header/forms; close tab. Missing external credentials means precisely reported blocked provider proof, not fake success.

After implementation assign independent medium-or-lower reviewer to actual diff/behavior/ownership/security; fix findings then rerun affected smoke. No listed execution command has been run during planning.

## Assumptions and contingencies

Defaults24h absolute TTL, equal CRUD access for verified users, SMTP/v2 checkbox, current-session-only logout. No role system/new JSON API/password-reset feature. Real registration resend semantics are fixed in shared contract. Missing approved disposable DB ->finish deterministic tests, report live persistence/concurrency proof blocked, never pick an arbitrary DB. Missing providers ->registration503 and deterministic adapter tests, no production bypass. If readiness fails, report startup/port cause and do not assert restart success.
