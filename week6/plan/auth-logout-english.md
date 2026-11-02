# Logout module — integration handoff

Updated 2026-11-02. The user chose **only the logout module**, leaving login/session implementation to a teammate, and additionally requested **Google reCAPTCHA v2 Checkbox for logout**. This overrides the earlier logout-only-CSRF design; registration/login CAPTCHA choices are separate.

The module is implemented with isolated HTTP/provider tests. It is not mounted in app.js and no real login/session/schema or Google credentials have been supplied. Do not claim a working integrated authentication flow.

Read the [shared contract](auth-parallel-plan.md), [Vietnamese detail](logout-implementation-plan.md), and the concrete [integration/key setup guide](../restaurant/docs/logout-integration.md).

Files: restaurant/src/auth/logout.js and recaptcha-v2.js; views/auth/logout.ejs; tests/auth-logout.test.js and recaptcha-v2.test.js; .env.example and docs/logout-integration.md.

Factory: createLogoutRouter({ prisma, requireLogin, requireCsrf, clearSessionCookie, authConfig, recaptchaVerifier }). It rejects missing required dependencies. Default recaptchaVerifier uses createLogoutRecaptchaFromEnv(), requiring an origin APP_BASE_URL (explicit HTTPS in production) and LOGOUT_RECAPTCHA_V2_SITE_KEY/SECRET_KEY.

The teammate must attach real session middleware first and provide req.auth.user {id,email}, req.auth.session {userId,sidHash} and res.locals.csrfToken. requireLogin checks active status/expiry/revocation and redirects 303 /login; requireCsrf enforces shared session token/origin checks. clearSessionCookie must match the real login cookie configuration.

- GET /logout/confirm: authenticated read-only v2 form; no session deletion.
- GET /logout: remains unregistered, 404 without mutation.
- POST /logout: requireLogin → requireCsrf → Google v2 siteverify → await deletion by this sidHash + userId → clear cookie → 303 /login.
- Invalid/missing/replayed CAPTCHA: 200 error form, session preserved. Provider/missing-config/store failure: 500, no successful logout.
- Anonymous/expired/pending request: login guard 303 /login; wrong CSRF/origin: 403 before Google.
- Other sessions survive. Teammate guards /dishes, /dishes/:id and /admin against replay of revoked sid.

Google enforces token expiry/single-use. challenge_ts is challenge load time; do not reject a fresh solved token merely because the challenge loaded over two minutes ago. V2 has no v3 action/score. No missing-key/provider bypass.

Future integration checks: real login/store/CSRF/cookie helpers, actual provider keys and browser solve, persistent DB deletion, captured-sid replay, second session survival and process restart. Tests using injected store/provider do not satisfy those live checks. See source checklist S06–S09 and user-extension acceptance in auth-acceptance-checklist.md.
