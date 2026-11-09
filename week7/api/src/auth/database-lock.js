// SQLite permits one writer per database. Acquire that reservation BEFORE any
// reads in a read/modify/write transaction, including when the email is unknown.
// A no-op UPDATE acquires the database lock without changing counters. The lock
// is released by commit/rollback and also coordinates independent app processes.
async function lockDatabaseWrite(tx) {
  await tx.$executeRaw`UPDATE rate_limit_buckets SET count = count WHERE 1 = 0`;
}

module.exports = { lockDatabaseWrite };
// Historical SQLite branch helper. Active PostgreSQL auth uses throttle.lock
// and shared User row locks instead; this module is not imported by app routes.
