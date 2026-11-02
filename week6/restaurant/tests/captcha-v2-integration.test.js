const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createRecaptchaVerifier } = require('../src/auth/captcha');
const { hashPassword, hashToken } = require('../src/auth/credentials');
const { createAuthStore } = require('./helpers/auth-store');

test('v2 checkbox forms and backend verification work for register and threshold-driven login', async () => {
  const user = { id: 1, email: 'active@example.com', status: 'active', role: 'viewer', emailVerifiedAt: new Date(),
    passwordHash: await hashPassword('original-password') };
  const prisma = createAuthStore({ users: [user] });
  const used = new Set(), verified = [], mail = [];
  const config = { appBaseUrl: 'http://localhost:3001', recaptchaSiteKey: 'v2-public', recaptchaSecretKey: 'v2-private' };
  const verifier = createRecaptchaVerifier(config, async (_url, options) => {
    const token = options.body.get('response');
    assert.equal(options.body.get('secret'), 'v2-private');
    verified.push(token);
    const success = token?.startsWith('solved-') && !used.has(token);
    if (success) used.add(token);
    // Real v2 responses do not require v3 action/score fields.
    return { ok: true, async json() { return success ? { success: true, hostname: 'localhost' }
      : { success: false, 'error-codes': ['timeout-or-duplicate'] }; } };
  });
  const app = createApp({ prisma, logger: { error() {} }, authConfig: config, recaptchaVerifier: verifier,
    mailer: { isConfigured: () => true, async sendActivationOtp(message) { mail.push(message); } } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, { cookie, data } = {}) => fetch(base + route, {
    redirect: 'manual', headers: { connection: 'close', ...(cookie ? { cookie } : {}) },
    ...(data ? { method: 'POST', body: new URLSearchParams(data) } : {})
  });
  async function form(route) {
    const response = await request(route), html = await response.text();
    return { cookie: response.headers.get('set-cookie').split(';')[0],
      csrf: html.match(/name="_csrf" value="([a-f0-9]{64})"/)[1], html };
  }
  const hasCheckbox = html => /class="g-recaptcha" data-sitekey="v2-public"/.test(html);
  try {
    const reg = await form('/register');
    assert.equal(hasCheckbox(reg.html), true);
    assert.match(reg.html, /recaptcha\/api\.js\?hl=vi/);
    assert.doesNotMatch(reg.html, /api\.js\?render=|data-captcha-action|v2-private|type="hidden" name="g-recaptcha-response"/);
    const register = proof => request('/register', { cookie: reg.cookie, data: {
      email: 'new@example.com', password: 'new-password', confirmPassword: 'new-password', _csrf: reg.csrf,
      'g-recaptcha-response': proof, captchaPassed: 'true', action: 'register', score: '1'
    } });
    assert.match(await (await register('')).text(), /INVALID_CAPTCHA/);
    assert.equal(prisma.state.users.size, 1);
    assert.equal((await register('solved-register')).status, 200);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(mail.length, 1);
    assert.match(await (await register('solved-register')).text(), /INVALID_CAPTCHA/);
    assert.equal(mail.length, 1);

    const login = await form('/login');
    assert.equal(hasCheckbox(login.html), false);
    const loginPost = (password, proof = '') => request('/login', { cookie: login.cookie, data: {
      email: user.email, password, _csrf: login.csrf, 'g-recaptcha-response': proof
    } });
    const priorCalls = verified.length;
    for (let i = 0; i < 3; i++) {
      const html = await (await loginPost('wrong')).text();
      assert.equal(hasCheckbox(html), i === 2);
    }
    assert.equal(verified.length, priorCalls, 'No CAPTCHA before the server threshold');
    assert.match(await (await loginPost('original-password')).text(), /INVALID_CAPTCHA/);
    assert.equal(prisma.state.attempts.get(hashToken(user.email)).failedCount, 3);
    const success = await loginPost('original-password', 'solved-login');
    assert.equal(success.status, 303);
    assert.equal(success.headers.get('location'), '/admin/dishes');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
