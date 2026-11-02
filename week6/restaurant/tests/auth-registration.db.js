// Active database test entrypoint uses the same PostgreSQL schema as the app.
// The original SQLite suite remains available in Git commit 2e81441; its SQL,
// fixture APIs and generated client are not compatible with the current app.
// Requires AUTH_TEST_DATABASE_URL + AUTH_TEST_ALLOW_DB_WRITE=1 explicitly.
require('./postgres-auth.integration');
