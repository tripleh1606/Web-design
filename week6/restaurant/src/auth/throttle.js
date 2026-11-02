// The caller supplies a Prisma transaction; PostgreSQL locks synchronize all app instances.
async function lock(tx, key) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
async function consume(tx, { key, limit, windowMs, cooldownMs = 0, now: suppliedNow }) {
  await lock(tx, `rate:${key}`);
  const old = await tx.rateLimitBucket.findUnique({ where: { key } });
  // Capture the clock after waiting for the lock; explicit clocks are for deterministic tests.
  const now = suppliedNow === undefined ? new Date() : typeof suppliedNow === 'function' ? suppliedNow() : suppliedNow;
  const inWindow = old && now - old.windowStartedAt < windowMs;
  const count = inWindow ? old.count : 0;
  const cooldownRemaining = old?.nextAllowedAt ? old.nextAllowedAt - now : 0;
  if (count >= limit || cooldownRemaining > 0) {
    const remaining = count >= limit ? windowMs - (now - old.windowStartedAt) : cooldownRemaining;
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(remaining / 1000)) };
  }
  const data = { count: count + 1, windowStartedAt: inWindow ? old.windowStartedAt : now,
    nextAllowedAt: cooldownMs ? new Date(now.getTime() + cooldownMs) : null };
  await tx.rateLimitBucket.upsert({ where: { key }, create: { key, ...data }, update: data });
  return { allowed: true, retryAfter: 0 };
}
module.exports = { lock, consume };
