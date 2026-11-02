# SSR authentication plan index

Updated 2026-11-02. These files are repository plans, not session-local artifacts. Use normal relative links.

1. [Repository discovery](auth-discovery.md).
2. [Canonical shared contract, Vietnamese](auth-parallel-plan.md).
3. [Shared contract, English reference](auth-contract-english.md).
4. [Foundation and login](auth-login-english.md).
5. [Registration and email OTP](auth-registration-english.md).
6. [Logout](auth-logout-english.md), with [Vietnamese detail](logout-implementation-plan.md).
7. [Forgot/reset password](auth-password-reset-english.md).
8. [Slide acceptance and submission evidence](auth-acceptance-checklist.md).

The source HTML and shared contract govern all parts. The old email-link activation, pending-password replacement, no-reset scope, /auth routes and anonymous CRUD 302 behavior have been replaced. Do not use ../recovered-auth-plans.md as current requirements.

One integrator implements shared persistence/session/CSRF/limits/provider interfaces first. Then implement features in disjoint files or sequentially, integrate real modules, run acceptance and review. No requirement to launch multiple agents. A plan checkbox is not runtime evidence.
