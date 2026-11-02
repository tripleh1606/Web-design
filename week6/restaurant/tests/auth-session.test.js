const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { hashPassword, hashToken, createRecaptchaVerifier } = require('../src/auth/session');

async function fixture(fn) {
  const attempts = new Map(), ips = new Map(), sessions = new Map();
  const user = { id: 1, email: 'user@example.com', passwordHash: await hashPassword('password123'), emailVerifiedAt: new Date() };
  const prisma = {
    dish: {}, chef: {}, ingredient: {}, dishIngredient: {}, chefDish: {},
    async $executeRaw() {}, async $transaction(fn) { return fn(this); },
    user: { async findUnique({ where }) { return where.email === user.email ? user : null; } },
    loginAttempt: {
      async findUnique({ where }) { return attempts.get(where.email) || null; },
      async delete({ where }) { attempts.delete(where.email); },
      async upsert({ where, create, update }) { attempts.set(where.email, attempts.has(where.email) ? { ...attempts.get(where.email), ...update } : { ...create }); }
    },
    loginIpLimit: {
      async findUnique({ where }) { return ips.get(where.ip) || null; },
      async upsert({ where, create, update }) { ips.set(where.ip, ips.has(where.ip) ? { ...ips.get(where.ip), ...update } : { ...create }); },
      async update({ where }) { ips.get(where.ip).count++; }
    },
    session: {
      async findUnique({ where }) { const s = sessions.get(where.tokenHash); return s ? { ...s, user } : null; },
      async create({ data }) { sessions.set(data.tokenHash, data); return data; },
      async deleteMany({ where }) { sessions.delete(where.tokenHash); return { count: 1 }; }
    }
  };
  const captcha = { async verifyToken(token) { return token === 'valid' ? { ok: true } : { ok: false, reason: 'verification-failed' }; } };
  const server = createApp({ prisma, logger: { error() {} }, recaptchaVerifier: captcha, authConfig: { appBaseUrl: 'http://localhost:3001', recaptchaSiteKey: 'test' } }).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function loginForm() { const response = await fetch(base + '/auth/login', { headers: { connection: 'close' } }); const html = await response.text(); const cookie = response.headers.get('set-cookie').match(/soucha_csrf=([^;]+)/)[1]; const token = html.match(/name="_csrf" value="([^"]+)"/)[1]; return { cookie, token }; }
  async function login(email, password, { captchaToken = 'valid', csrf = true } = {}) { const { cookie, token } = await loginForm(); return fetch(base + '/auth/login', { method: 'POST', redirect: 'manual', headers: { connection: 'close', cookie: `soucha_csrf=${cookie}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password, _csrf: csrf ? token : '', 'g-recaptcha-response': captchaToken }) }); }
  try { await fn({ login, loginForm, attempts, ips, sessions, user, base }); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('CAPTCHA checks hostname, provider and missing configuration', async () => {
  const env = { APP_BASE_URL: 'https://example.com', RECAPTCHA_SITE_KEY: 'site', RECAPTCHA_SECRET_KEY: 'secret' };
  let submitted;
  const verifier = createRecaptchaVerifier(env, async (_url, options) => { submitted = options.body; return { ok: true, async json() { return { success: true, hostname: 'example.com' }; } }; });
  assert.equal((await verifier.verifyToken('challenge', '127.0.0.1')).ok, true);
  assert.equal(submitted.get('secret'), 'secret');
  assert.equal((await createRecaptchaVerifier(env, async () => ({ ok: true, async json() { return { success: true, hostname: 'evil.example' }; } })).verifyToken('x')).ok, false);
  assert.equal((await createRecaptchaVerifier({}, async () => {}).verifyToken('x')).reason, 'not-configured');
  assert.equal((await createRecaptchaVerifier(env, async () => { throw new Error('offline'); }).verifyToken('x')).reason, 'network-error');
});

test('login checks CAPTCHA, CSRF, lockout and reset by normalized unknown email', async () => fixture(async ({ login, attempts, ips }) => {
  assert.equal((await login('missing@example.com', 'bad', { csrf: false })).status, 403);
  assert.equal((await login('missing@example.com', 'bad', { captchaToken: '' })).status, 400);
  for (let i = 0; i < 3; i++) assert.equal((await login(' Missing@Example.com ', 'bad')).status, 401);
  let row = attempts.get('missing@example.com');
  assert.equal(row.failures, 3);
  assert.ok(row.lockedUntil - row.lastFailure === 30000);
  const locked = await login('missing@example.com', 'bad');
  assert.equal(locked.status, 429); assert.ok(Number(locked.headers.get('retry-after')) > 0);
  row.lockedUntil = new Date(Date.now() - 1);
  assert.equal((await login('missing@example.com', 'bad')).status, 401);
  row = attempts.get('missing@example.com'); assert.equal(row.lockedUntil - row.lastFailure, 60000);
  row.lastFailure = new Date(Date.now() - 86400001); row.lockedUntil = null; ips.clear();
  assert.equal((await login('missing@example.com', 'bad')).status, 401);
  assert.equal(attempts.get('missing@example.com').failures, 1);
}));

test('verified login issues hashed session and protects admin with CSRF', async () => fixture(async ({ login, attempts, sessions, user, base }) => {
  assert.equal((await login('user@example.com', 'wrong')).status, 401);
  const response = await login('USER@example.com', 'password123');
  assert.equal(response.status, 303); assert.equal(attempts.has('user@example.com'), false);
  const cookie = response.headers.get('set-cookie').match(/soucha_session=([a-f0-9]+)/)[1];
  assert.ok(sessions.has(hashToken(cookie))); assert.equal(sessions.has(cookie), false);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal((await fetch(base + '/admin/dishes', { redirect: 'manual' })).status, 302);
  const denied = await fetch(base + '/admin/dishes', { method: 'POST', redirect: 'manual', headers: { cookie: `soucha_session=${cookie}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=bad' });
  const sessionCsrf = sessions.get(hashToken(cookie)).csrfToken;
  const crossOrigin = await fetch(base + '/admin/dishes', { method: 'POST', redirect: 'manual', headers: { cookie: `soucha_session=${cookie}`, origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: sessionCsrf }) });
  assert.equal(crossOrigin.status, 403);
  assert.equal(denied.status, 403);
  user.emailVerifiedAt = null;
  assert.equal((await fetch(base + '/admin/dishes', { redirect: 'manual', headers: { cookie: `soucha_session=${cookie}` } })).status, 302);
}));
test('progressive lockout reaches fifteen minutes and IP limiting returns Retry-After', async () => fixture(async ({ login, attempts, ips }) => {
  for (let i = 0; i < 9; i++) {
    const response = await login('missing@example.com', 'bad');
    assert.equal(response.status, 401);
    const row = attempts.get('missing@example.com');
    if (i >= 2) {
      assert.equal(row.lockedUntil - row.lastFailure, Math.min(900, 30 * 2 ** (i - 2)) * 1000);
      row.lockedUntil = new Date(Date.now() - 1);
    }
  }
  ips.clear();
  for (let i = 0; i < 20; i++) assert.equal((await login(`unknown${i}@example.com`, 'bad', { captchaToken: '' })).status, 400);
  const limited = await login('other@example.com', 'bad');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
}));

