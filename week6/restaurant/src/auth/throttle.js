const { lockDatabaseWrite } = require('./database-lock');
const { hashToken } = require('./session');
const emailKey = email => hashToken(email);
const retrySeconds = (until, now) => Math.max(1, Math.ceil((until - now) / 1000));

// All callers acquire keys in sorted order. No in-memory fallback on DB failure.
async function consumeBuckets(tx, specs, now) {
  await lockDatabaseWrite(tx);
  const sorted = [...specs].sort((a, b) => a.key.localeCompare(b.key));
  let retry = 0;
  for (const spec of sorted) {
    let row = await tx.rateLimitBucket.findUnique({ where: { key: spec.key } });
    if (!row || now - row.windowStartedAt >= spec.windowMs) {
      row = await tx.rateLimitBucket.upsert({ where: { key: spec.key },
        create: { key: spec.key, count: 0, windowStartedAt: now, nextAllowedAt: row?.nextAllowedAt ?? null },
        update: { count: 0, windowStartedAt: now } });
    }
    if (row.count >= spec.max) retry = Math.max(retry, retrySeconds(new Date(row.windowStartedAt.getTime() + spec.windowMs), now));
    if (row.nextAllowedAt > now) retry = Math.max(retry, retrySeconds(row.nextAllowedAt, now));
    await tx.rateLimitBucket.update({ where: { key: spec.key }, data: {
      count: { increment: 1 },
      ...(spec.cooldownMs && !retry ? { nextAllowedAt: new Date(now.getTime() + spec.cooldownMs) } : {})
    } });
  }
  return retry;
}

async function lockActivationAttempt(tx, email, clock = () => new Date()) {
  const key = emailKey(email);
  // Reserve the SQLite writer before reading or creating an email budget.
  await lockDatabaseWrite(tx);
  let attempt = await tx.activationAttempt.upsert({ where: { emailKey: key },
    create: { emailKey: key, attempts: 0, lockedUntil: null }, update: {} });
  const now = clock();
  if (attempt.lockedUntil && attempt.lockedUntil <= now) {
    attempt = await tx.activationAttempt.update({ where: { emailKey: key }, data: { attempts: 0, lockedUntil: null } });
  }
  return attempt;
}

module.exports = { consumeBuckets, lockActivationAttempt, emailKey, retrySeconds };
