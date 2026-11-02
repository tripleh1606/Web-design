const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { hashToken } = require('../src/auth/credentials');
const { createAuthStore } = require('./helpers/auth-store');
const { verifySessionLifecycle } = require('./helpers/session-lifecycle');

async function fixture(run, { loseSessionsOnRestart = false } = {}) {
  const sid = 'a'.repeat(64), csrfToken = 'b'.repeat(64), now = new Date();
  const prisma = createAuthStore({ users: [{ id: 1, email: 'smoke@example.com', role: 'viewer', status: 'active', emailVerifiedAt: now }] });
  prisma.dish.findMany = async () => [];
  await prisma.session.create({ data: { sidHash: hashToken(sid), userId: 1, csrfToken,
    createdAt: now, lastSeenAt: now, expiresAt: new Date(+now + 3_600_000) } });
  let server;
  const events = [];
  async function start() {
    const app = createApp({ prisma, logger: { error() {} }, authConfig: { appBaseUrl: 'http://localhost:3001' },
      logoutRecaptchaVerifier: { siteKey: 'fixture-v2', isConfigured: () => true, async verify() { return { ok: true }; } } });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
  }
  async function stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await start();
  try {
    await run({ events, prisma, verify: () => verifySessionLifecycle({
      sid, csrfToken, captchaProof: 'isolated-proof',
      request: (route, options) => {
        if (route === '/logout') events.push('logout');
        return fetch(`http://127.0.0.1:${server.address().port}${route}`, options);
      },
      restart: async () => {
        events.push('restart');
        assert.ok(prisma.state.sessions.has(hashToken(sid)), 'Restart must be tested with a live session');
        await stop();
        if (loseSessionsOnRestart) prisma.state.sessions.clear();
        await start();
      },
      findSession: () => prisma.session.findUnique({ where: { sidHash: hashToken(sid) } })
    }) });
  } finally { await stop(); }
}

test('smoke lifecycle checks CSRF and restart while authenticated, then logout and revoked-sid replay', async () => {
  await fixture(async ({ verify, events, prisma }) => {
    await verify();
    assert.deepEqual(events, ['restart', 'logout']);
    assert.equal(prisma.state.sessions.size, 0);
  });
});

test('smoke lifecycle detects session persistence failure before attempting logout', async () => {
  await fixture(async ({ verify, events }) => {
    await assert.rejects(verify(), /An unexpired session must survive restart/);
    assert.deepEqual(events, ['restart']);
  }, { loseSessionsOnRestart: true });
});
