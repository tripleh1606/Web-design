// Opt-in only. No app .env is loaded and the shared DATABASE_URL is never used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const enabled = Boolean(process.env.AUTH_TEST_DATABASE_URL && process.env.AUTH_TEST_ALLOW_DB_WRITE === '1');

test('disposable PostgreSQL: real OTP concurrency, persistent sessions and scoped logout', { skip: !enabled }, async () => {
  const { PrismaClient } = require('../generated/prisma');
  const { createApp } = require('../src/app');
  const { hashToken } = require('../src/auth/credentials');
  const dbUrl = new URL(process.env.AUTH_TEST_DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(dbUrl.protocol));
  const schema = `auth_test_${randomBytes(12).toString('hex')}`;
  dbUrl.searchParams.set('schema', schema);
  const url = dbUrl.toString();
  const setup = spawnSync(process.execPath, [path.join(__dirname, '../node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate'], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', timeout: 60000
  });
  assert.equal(setup.status, 0, 'Disposable schema setup failed. Check test DB permissions (output suppressed to protect credentials).');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let server;
  const sent = [];
  const app = createApp({ prisma, logger: { error() {} }, authConfig: { appBaseUrl: 'http://localhost:3001', recaptchaSiteKey: 'test-v2' },
    mailer: { isConfigured: () => true, async sendActivationOtp(message) { sent.push(message); } },
    recaptchaVerifier: { async verify(token) { return { ok: token === 'fixture-proof', reason: 'invalid' }; } },
    logoutRecaptchaVerifier: { siteKey: 'test-v2', isConfigured: () => true, async verify(token) { return { ok: token === 'fixture-logout', reason: 'invalid' }; } }
  });
  async function start() {
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = null; } }
  let base;
  async function request(route, { sid, data } = {}) {
    return fetch(base + route, { redirect: 'manual', headers: { connection: 'close', ...(sid ? { cookie: `sid=${sid}` } : {}) },
      ...(data ? { method: 'POST', body: new URLSearchParams(data) } : {}) });
  }
  async function form(route) {
    const response = await request(route), html = await response.text();
    assert.equal(response.status, 200);
    return { sid: response.headers.get('set-cookie').match(/sid=([a-f0-9]{64})/)[1],
      csrf: html.match(/name="_csrf" value="([a-f0-9]{64})"/)[1] };
  }
  async function login(email, password) {
    const f = await form('/login');
    const response = await request('/login', { sid: f.sid, data: { email, password, _csrf: f.csrf } });
    assert.equal(response.status, 303);
    const sid = response.headers.get('set-cookie').match(/sid=([a-f0-9]{64})/)[1];
    assert.equal(await prisma.session.findUnique({ where: { sidHash: hashToken(f.sid) } }), null);
    return { sid, row: await prisma.session.findUnique({ where: { sidHash: hashToken(sid) } }) };
  }
  try {
    base = await start();
    const email = 'postgres-test@example.com', password = 'original-password';
    const f = await form('/register');
    assert.equal((await request('/register', { sid: f.sid, data: { email, password, confirmPassword: password, role: 'admin', status: 'active', _csrf: f.csrf, 'g-recaptcha-response': 'fixture-proof' } })).status, 200);
    for (let i = 0; i < 50 && !sent.length; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sent.length, 1);
    const pending = await prisma.user.findUnique({ where: { email } });
    assert.equal(pending.role, 'viewer'); assert.equal(pending.status, 'pending');
    const data = { email, otp: sent[0].otp, _csrf: f.csrf };
    const responses = await Promise.all([request('/activate', { sid: f.sid, data }), request('/activate', { sid: f.sid, data })]);
    const bodies = await Promise.all(responses.map(response => response.text()));
    assert.equal(bodies.filter(html => html.includes('INVALID_OTP')).length, 1, 'Concurrent OTP must have exactly one loser');
    const challenge = await prisma.activationChallenge.findUnique({ where: { userId: pending.id } });
    assert.ok(challenge.usedAt);
    assert.equal((await prisma.user.findUnique({ where: { email } })).status, 'active');
    const a = await login(email, password), b = await login(email, password);
    assert.equal((await request('/dishes', { sid: a.sid })).status, 200);
    await stop(); await prisma.$disconnect(); base = await start();
    assert.equal((await request('/dishes', { sid: a.sid })).status, 200, 'Same cookie survives app/store reconnection');
    assert.equal((await request('/logout', { sid: a.sid, data: { _csrf: a.row.csrfToken, 'g-recaptcha-response': 'fixture-logout' } })).status, 303);
    assert.equal((await request('/dishes', { sid: a.sid })).status, 303);
    assert.equal((await request('/dishes', { sid: b.sid })).status, 200);
    assert.equal(await prisma.session.findUnique({ where: { sidHash: hashToken(a.sid) } }), null);
  } finally {
    await stop();
    // The identifier is generated above, never derived from a URL or user input.
    assert.match(schema, /^auth_test_[a-f0-9]{24}$/);
    await prisma.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await prisma.$disconnect();
  }
});
