const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createAuthStore } = require('./helpers/auth-store');

test('stale registration form is rejected with a recovery link; a fresh form works without weakening CSRF', async () => {
  const prisma = createAuthStore();
  let captchaCalls = 0;
  const app = createApp({ prisma, logger: { error() {} },
    authConfig: { appBaseUrl: 'http://localhost:3001', recaptchaSiteKey: 'test-v2' },
    recaptchaVerifier: { async verify() { captchaCalls++; throw new Error('Invalid form must not reach CAPTCHA'); } }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  async function form(cookie = '') {
    const response = await request('/register', { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    return { cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie,
      csrf: html.match(/name="_csrf" value="([a-f0-9]{64})"/)[1] };
  }
  async function post(identity, csrf = identity.csrf, origin = 'http://localhost:3001') {
    return request('/register', { method: 'POST', headers: { cookie: identity.cookie, origin },
      body: new URLSearchParams({ _csrf: csrf, email: 'not-an-email', password: '', confirmPassword: '' }) });
  }
  try {
    const a = await form(), b = await form();
    const stale = await post(b, a.csrf);
    assert.equal(stale.status, 403);
    const staleHtml = await stale.text();
    assert.match(staleHtml, /data-error-code="FORM_STALE"/);
    assert.match(staleHtml, /href="\/register"/);
    assert.ok(!staleHtml.includes(a.csrf) && !staleHtml.includes(b.csrf));
    const fresh = await form(b.cookie);
    const recovered = await post(fresh);
    assert.equal(recovered.status, 200);
    assert.match(await recovered.text(), /VALIDATION_FAILED/);
    const missing = await post({ cookie: '', csrf: a.csrf });
    assert.equal(missing.status, 403);
    assert.match(await missing.text(), /SESSION_EXPIRED/);
    const foreign = await post(fresh, fresh.csrf, 'https://evil.example');
    assert.equal(foreign.status, 403);
    const foreignHtml = await foreign.text();
    assert.match(foreignHtml, /ORIGIN_MISMATCH/);
    assert.match(foreignHtml, /href="http:\/\/localhost:3001\/register"/);
    assert.equal(prisma.state.users.size, 0);
    assert.equal(captchaCalls, 0);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

const { requireCsrf } = require('../src/auth/session');

test('null Origin requires same-origin browser metadata, canonical host and the session CSRF token', () => {
  const token = 'a'.repeat(64);
  const cases = [
    { name: 'native same-origin form', accepted: true },
    { name: 'cross-site form', site: 'cross-site' },
    { name: 'same-site form', site: 'same-site' },
    { name: 'missing metadata', site: undefined },
    { name: 'wrong host', host: '127.0.0.1:3001' },
    { name: 'wrong port', host: 'localhost:5173' },
    { name: 'wrong CSRF', csrf: 'wrong' },
    { name: 'missing CSRF', csrf: '' },
    { name: 'malformed explicit origin', origin: 'not-an-origin' },
    { name: 'missing session', session: null },
    { name: 'explicit foreign origin', origin: 'https://evil.example' }
  ];
  for (const entry of cases) {
    const headers = { Origin: entry.origin || 'null', Host: entry.host || 'localhost:3001',
      'Sec-Fetch-Site': Object.hasOwn(entry, 'site') ? entry.site : 'same-origin' };
    const req = { path: '/register', get: key => headers[key],
      authConfig: { appBaseUrl: 'http://localhost:3001' },
      auth: { session: Object.hasOwn(entry, 'session') ? entry.session : { csrfToken: token } },
      body: { _csrf: Object.hasOwn(entry, 'csrf') ? entry.csrf : token } };
    let accepted = false, status;
    const res = { status(value) { status = value; return this; }, render() {} };
    requireCsrf(req, res, () => { accepted = true; });
    assert.equal(accepted, entry.accepted === true, entry.name);
    if (!accepted) assert.equal(status, 403, entry.name);
  }
});
