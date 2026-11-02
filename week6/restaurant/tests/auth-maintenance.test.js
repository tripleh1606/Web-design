const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthStore } = require('./helpers/auth-store');
const { hashToken, verifyPassword } = require('../src/auth/credentials');
const { seedAuth } = require('../prisma/seed-auth');
const { upgradeLegacyAuth } = require('../scripts/upgrade-legacy-auth');
const { cleanSessions } = require('../scripts/clean-sessions');

test('auth seed creates a viewer with Argon2id and never replaces or activates an existing pending account', async () => {
  const prisma = createAuthStore();
  const env = { AUTH_SEED_EMAIL: 'demo@EXAMPLE.com', AUTH_SEED_PASSWORD: 'preserved-password' };
  assert.deepEqual(await seedAuth(prisma, env), { created: true });
  const created = await prisma.user.findUnique({ where: { email: 'demo@example.com' } });
  assert.equal(created.role, 'viewer'); assert.equal(created.status, 'active');
  assert.match(created.passwordHash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(env.AUTH_SEED_PASSWORD, created.passwordHash), true);
  await prisma.user.update({ where: { id: created.id }, data: { status: 'pending', emailVerifiedAt: null } });
  assert.deepEqual(await seedAuth(prisma, { ...env, AUTH_SEED_PASSWORD: 'different-password' }), { created: false });
  const unchanged = await prisma.user.findUnique({ where: { id: created.id } });
  assert.equal(unchanged.passwordHash, created.passwordHash); assert.equal(unchanged.status, 'pending');
});

test('legacy upgrade retains password hashes/verification and converts counters without clearing failures', async () => {
  const prisma = createAuthStore({ users: [
    { id: 1, email: 'active@example.com', emailOriginal: '', passwordHash: 'legacy-hash', status: 'pending', emailVerifiedAt: new Date() },
    { id: 2, email: 'pending@example.com', emailOriginal: '', passwordHash: 'another-hash', status: 'pending', emailVerifiedAt: null }
  ] });
  await prisma.loginAttempt.create({ data: { emailKey: 'active@example.com', failedCount: 4, windowStartedAt: new Date(), lockedUntil: null } });
  const result = await upgradeLegacyAuth(prisma);
  assert.deepEqual(result, { users: 2, counters: 1 });
  const active = await prisma.user.findUnique({ where: { id: 1 } });
  assert.equal(active.status, 'active'); assert.equal(active.passwordHash, 'legacy-hash');
  assert.equal((await prisma.user.findUnique({ where: { id: 2 } })).status, 'pending');
  assert.equal((await prisma.loginAttempt.findUnique({ where: { emailKey: hashToken(active.email) } })).failedCount, 4);
  assert.deepEqual(await upgradeLegacyAuth(prisma), { users: 0, counters: 0 });
});

test('maintenance removes expired and idle sessions while preserving active ones', async () => {
  const prisma = createAuthStore();
  const now = new Date();
  for (const [sidHash, lastSeenAt, expiresAt] of [
    ['live', now, new Date(+now + 100000)],
    ['idle', new Date(+now - 1800001), new Date(+now + 100000)],
    ['expired', now, new Date(+now - 1)]
  ]) await prisma.session.create({ data: { sidHash, lastSeenAt, expiresAt, userId: null } });
  assert.equal((await cleanSessions(prisma, { sessionIdleMs: 1800000 }, now)).count, 2);
  assert.equal(prisma.state.sessions.size, 1); assert.ok(prisma.state.sessions.has('live'));
});


test('seed always creates a viewer and preserves an existing account role', async () => {
  const prisma = createAuthStore();
  const env = { AUTH_SEED_EMAIL: 'demo@example.com', AUTH_SEED_PASSWORD: 'secure-demo-password', AUTH_SEED_ROLE: 'admin' };
  assert.deepEqual(await seedAuth(prisma, env), { created: true });
  const viewer = await prisma.user.findUnique({ where: { email: env.AUTH_SEED_EMAIL } });
  assert.equal(viewer.role, 'viewer');
  assert.equal(viewer.status, 'active');
  assert.ok(viewer.emailVerifiedAt);
  await prisma.user.update({ where: { id: viewer.id }, data: { role: 'admin' } });
  assert.deepEqual(await seedAuth(prisma, env), { created: false });
  const unchanged = await prisma.user.findUnique({ where: { email: env.AUTH_SEED_EMAIL } });
  assert.equal(unchanged.role, 'admin');
  assert.equal(unchanged.passwordHash, viewer.passwordHash);
});
