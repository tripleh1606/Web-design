const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { hashPassword, hashToken } = require('../src/auth/credentials');
const { createAuthStore } = require('./helpers/auth-store');

test('real app wiring: rotate anonymous sid, login two devices, CAPTCHA logout A, replay denied and B survives', async () => {
  const user = { id: 1, email: 'user@example.com', emailOriginal: 'user@example.com', role: 'viewer',
    status: 'active', emailVerifiedAt: new Date(), passwordHash: await hashPassword('original-password') };
  const prisma = createAuthStore({ users: [user] });
  let reads = 0;
  const dishes = [];
  Object.assign(prisma, { dish: {
    async findMany() { reads++; return dishes; },
    async create({ data }) { const dish = { id: dishes.length + 1, ...data }; dishes.push(dish); return dish; }
  }, chef: {}, ingredient: {}, chefDish: {}, dishIngredient: {} });
  const used = new Set();
  const app = createApp({ prisma, logger: { error() {} }, authConfig: { appBaseUrl: 'http://localhost:3001' },
    recaptchaVerifier: { async verify() { throw new Error('First-attempt login must not call CAPTCHA'); } },
    logoutRecaptchaVerifier: { siteKey: 'public-v2-test-key', isConfigured: () => true, async verify(token) {
      if (token !== 'solved-once' || used.has(token)) return { ok: false, reason: 'invalid' };
      used.add(token); return { ok: true };
    } }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { cookie, data, ...options } = {}) => fetch(base + path, {
    redirect: 'manual', ...options, ...(data ? { method: 'POST', body: new URLSearchParams(data) } : {}),
    headers: { connection: 'close', ...(cookie ? { cookie } : {}), ...options.headers }
  });
  async function login() {
    const page = await request('/login');
    const html = await page.text();
    const anonymousSid = page.headers.get('set-cookie').match(/sid=([a-f0-9]{64})/)[1];
    const csrf = html.match(/name="_csrf" value="([a-f0-9]{64})"/)[1];
    const result = await request('/login', { cookie: `sid=${anonymousSid}`, data: { email: user.email, password: 'original-password', _csrf: csrf } });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), '/admin/dishes');
    const sid = result.headers.get('set-cookie').match(/sid=([a-f0-9]{64})/)[1];
    assert.notEqual(sid, anonymousSid);
    assert.equal(prisma.state.sessions.has(hashToken(anonymousSid)), false);
    const row = prisma.state.sessions.get(hashToken(sid));
    assert.ok(row); assert.equal(prisma.state.sessions.has(sid), false);
    return { sid, csrf: row.csrfToken, cookie: `sid=${sid}` };
  }
  try {
    for (const path of ['/dishes', '/admin/dishes']) {
      const denied = await request(path); assert.equal(denied.status, 303); assert.equal(denied.headers.get('location'), '/login');
    }
    assert.equal(reads, 0);
    const a = await login(), b = await login();
    assert.equal((await request('/dishes', a)).status, 200);
    assert.equal((await request('/admin/dishes', a)).status, 200);
    const created = await request('/admin/dishes', { ...a, data: { _csrf: a.csrf, name: 'Viewer test dish', price: '25000' } });
    assert.equal(created.status, 303);
    assert.equal(dishes.length, 1);
    assert.equal((await request('/logout/confirm', a)).status, 200);
    assert.equal((await request('/logout', a)).status, 404);
    assert.ok(prisma.state.sessions.has(hashToken(a.sid)));
    const noProof = await request('/logout', { ...a, data: { _csrf: a.csrf, captchaPassed: 'true' } });
    assert.equal(noProof.status, 200);
    assert.ok(prisma.state.sessions.has(hashToken(a.sid)));
    assert.equal((await request('/auth/logout', { ...a, data: { _csrf: a.csrf } })).status, 404);
    const deniedCsrf = await request('/logout', { ...a, data: { _csrf: a.csrf, 'g-recaptcha-response': 'solved-once' }, headers: { origin: 'https://evil.example' } });
    assert.equal(deniedCsrf.status, 403); assert.equal(used.size, 0);
    const loggedOut = await request('/logout', { ...a, data: { _csrf: a.csrf, 'g-recaptcha-response': 'solved-once' } });
    assert.equal(loggedOut.status, 303); assert.equal(loggedOut.headers.get('location'), '/login');
    assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal(prisma.state.sessions.has(hashToken(a.sid)), false);
    assert.equal((await request('/dishes', a)).status, 303);
    const deniedWrite = await request('/admin/dishes', { ...a, data: { _csrf: a.csrf, name: 'Revoked write', price: '25000' } });
    assert.equal(deniedWrite.status, 303);
    assert.equal(deniedWrite.headers.get('location'), '/login');
    assert.equal(dishes.length, 1);
    assert.equal((await request('/dishes', b)).status, 200);
    assert.equal((await request('/admin/dishes', b)).status, 200);
    assert.equal((await request('/logout', { ...b, data: { _csrf: b.csrf, 'g-recaptcha-response': 'solved-once' } })).status, 200);
    assert.ok(prisma.state.sessions.has(hashToken(b.sid)));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
