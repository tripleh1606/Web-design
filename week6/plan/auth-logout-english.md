# Implementation plan — current-session logout

Updated 2026-11-02. Planning only. Follow [shared contract](auth-parallel-plan.md), [Vietnamese logout detail](logout-implementation-plan.md) and source slides 34, 54, 60.

## Ownership

Create restaurant/src/auth/logout.js and tests/auth-logout.test.js. Reuse shared session/cookie/CSRF/store helpers; the integrator mounts the router at root and adds the header form. Foundation must provide real persistent session lookup/deletion and protected CRUD first.

## Behavior

- POST /logout verifies current session CSRF and origin policy.
- Derive the lookup hash from the incoming validated sid; delete only the current Session. Never delete by userId for ordinary logout.
- Await successful database deletion before expiring sid cookie (same name/path/domain) and returning **303 Location: /login**.
- If deletion fails, return technical 500; no success redirect or cookie-only success. Do not log sid/hash/CSRF.
- GET /logout returns 404 and does not change session state.
- Anonymous form session with valid CSRF may be destroyed and redirected; missing/invalid CSRF is 403. Replaying the old logout request need not succeed.
- Other sessions of the same account survive. This differs from reset password, which must delete all user sessions.
- Auth response no-store. Back can show an old page, but new requests to /dishes, /dishes/:id or /admin with the captured former sid must receive **303 /login**.

## Verification

Use real HTTP route/middleware and a controlled store fixture for deterministic tests, then disposable PostgreSQL for integration.

1. Authenticate sessions A/B for the same user; both can access /admin.
2. Capture A's sid privately. Submit the rendered A form: verify deletion, expired cookie and 303 /login.
3. Replay captured sid A against /dishes and /dishes/:id as well as representative /admin read and mutation routes; 303 /login and no CRUD access/change. Session B still works.
4. Test missing/wrong CSRF and foreign Origin: 403, valid session remains.
5. GET /logout: 404 and session still works.
6. Hold deletion pending and then reject it: no premature successful response; failure is 500 and not presented as logout success.
7. Check session expiration separately and restart the server to demonstrate B remains in the persistent store.
8. Capture redacted UI, Network, Cookies and DB row evidence, plus direct HTTP replay. Mark S06–S09 only after observation.

Commands and integration fixtures are owned by the login integrator. Do not seed or touch arbitrary shared Supabase data to test logout.
