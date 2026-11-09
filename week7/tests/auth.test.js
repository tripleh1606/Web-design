const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { randomBytes } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { fixture } = require('./helpers');
const { createAccessTokens } = require('../api/src/auth/access-token');
const { createRecaptchaV2Verifier } = require('../api/src/auth/recaptcha-v2');

test('access-token middleware verifies with its loaded key and has no store dependency', (t) => {
  const accessTokens = createAccessTokens(randomBytes(32).toString('base64url'));
  const token = accessTokens.issue(42);
  const req = { get: (header) => header === 'Authorization' ? 'Bearer ' + token : undefined };
  const res = { set: () => assert.fail('valid token was rejected') };
  const readFile = t.mock.method(fs, 'readFile', () => assert.fail('unexpected file read'));
  const readFileSync = t.mock.method(fs, 'readFileSync', () => assert.fail('unexpected synchronous file read'));
  let advanced = false;
  try {
    accessTokens.requireAccessToken(req, res, () => { advanced = true; });
  } finally {
    readFile.mock.restore();
    readFileSync.mock.restore();
  }
  assert.equal(advanced, true);
  assert.deepEqual(req.auth, { userId: 42 });
});

test('access token is valid at 59 seconds and rejected at 60 seconds', (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const accessTokens = createAccessTokens(randomBytes(32).toString('base64url'));
  const token = accessTokens.issue(42);
  const req = { get: () => 'Bearer ' + token };
  const res = { set() {}, status(code) { assert.equal(code, 401); return this; }, json(body) { return body; } };
  now += 59_000;
  assert.equal(accessTokens.requireAccessToken(req, res, () => 'accepted'), 'accepted');
  now += 1_000;
  const denied = accessTokens.requireAccessToken(req, res, () => assert.fail('Expired token accepted'));
  assert.equal(denied.error.code, 'AUTH_REQUIRED');
});

test('Week 7 accepts a copied bearer JWT after logout until it expires', async (t) => {
  const delivered = {};
  const verified = new Set();
  const captcha = createRecaptchaV2Verifier({
    siteKey: 'public-site', secretKey: 'private-secret', expectedHostname: 'localhost',
    async fetchImpl(url, { body }) {
      assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
      assert.equal(body.get('secret'), 'private-secret');
      const token = body.get('response');
      if (token === 'provider-down') throw new Error('Simulated outage');
      if (!token.startsWith('valid-') || verified.has(token)) {
        return Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] });
      }
      verified.add(token);
      return Response.json({ success: true, hostname: token === 'valid-foreign' ? 'foreign.example' : 'localhost' });
    }
  });
  const key = randomBytes(32);
  const app = await fixture({ auth: {
    jwtSecret: key.toString('base64url'),
    recaptchaVerifier: captcha,
    mailer: {
      isConfigured: () => true,
      sendActivationOtp(message) { delivered.otp = message.otp; },
      sendPasswordResetEmail(message) { delivered.reset = message.resetUrl; },
      sendPasswordChangedNotice(message) { delivered.changed = message.to; }
    }
  } });
  t.after(() => app.close());
  const origin = 'http://localhost:5173';
  let accessToken;
  async function request(path, data, options = {}) {
    const { headers, ...rest } = options;
    return app.call(path, {
      method: data === undefined ? 'GET' : 'POST', data, ...rest,
      headers: { Origin: origin, ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}), ...headers }
    });
  }
  const auth = (action, data, options) => request('/api/auth/' + action, data, options);
  const code = (response) => response.body.error?.code;
  const email = 'tester@example.com';
  const password = "  soucha-P'ass<word>&!  ";
  const login = (attempt, token) => auth('login', { email, password: attempt, 'g-recaptcha-response': token });
  const waitForMail = async (key) => {
    for (let i = 0; i < 20 && !delivered[key]; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(delivered[key]);
    return delivered[key];
  };

  assert.equal((await request('/api/dishes')).status, 401);
  const preflight = await request('/api/auth/register', undefined, { method: 'OPTIONS' });
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
  const bootstrap = await auth('config');
  assert.equal(bootstrap.body.data.recaptchaSiteKey, 'public-site');
  assert.ok(!JSON.stringify(bootstrap.body).includes('private-secret'));
  assert.equal(bootstrap.headers.get('set-cookie'), null);
  const registration = { email, password, confirmPassword: password };
  assert.equal(code(await auth('register', { ...registration, role: 'admin' })), 'VALIDATION_FAILED');
  assert.equal(code(await auth('register', { ...registration, email: "x' OR 1=1 --" })), 'VALIDATION_FAILED');
  assert.equal(code(await auth('login', { email: { $ne: null }, password })), 'VALIDATION_FAILED');
  const plainForm = await app.call('/api/auth/login', { method: 'POST', body: 'email=bad', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(plainForm.status, 415);
  assert.equal(code(await auth('register', registration)), 'INVALID_CAPTCHA');
  assert.equal(code(await auth('register', { ...registration, 'g-recaptcha-response': 'valid-foreign' })), 'INVALID_CAPTCHA');
  assert.equal(code(await auth('register', { ...registration, 'g-recaptcha-response': 'provider-down' })), 'PROVIDER_UNAVAILABLE');
  assert.equal(await app.prisma.user.count(), 0);
  assert.equal((await auth('register', { ...registration, 'g-recaptcha-response': 'valid-register' })).body.ok, true);
  assert.equal(code(await login(password)), 'ACCOUNT_PENDING');
  const otp = await waitForMail('otp');
  assert.equal(code(await auth('activate/resend', { email })), 'RATE_LIMITED');
  assert.equal((await auth('activate', { email, otp })).body.ok, true);
  assert.equal(code(await auth('activate', { email, otp })), 'INVALID_OTP');

  for (let i = 1; i <= 3; i++) {
    const failed = await login('wrong-password');
    assert.equal(code(failed), 'INVALID_CREDENTIALS');
    assert.equal(failed.body.error.needsCaptcha, i === 3);
  }
  assert.equal(code(await login(password)), 'INVALID_CAPTCHA');
  assert.equal(code(await login(password, 'valid-register')), 'INVALID_CAPTCHA');
  const signedIn = await login(password, 'valid-login');
  assert.equal(signedIn.body.data.user.email, email);
  accessToken = signedIn.body.data.accessToken;
  assert.equal(signedIn.body.data.tokenType, 'Bearer');
  assert.equal(signedIn.headers.get('set-cookie'), null);
  assert.equal(Object.hasOwn(signedIn.body.data, 'refreshToken'), false);
  const claims = jwt.decode(accessToken);
  assert.equal(claims.sub, String(signedIn.body.data.user.id));
  assert.equal(claims.exp - claims.iat, 60);
  assert.equal((await request('/api/dishes')).body.ok, true);
  assert.equal((await request('/api/dishes', { name: 'Trà', price: 100 }, { headers: { Authorization: '' } })).status, 401);
  assert.equal((await request('/api/dishes', { name: 'Trà', price: '0; DROP TABLE dishes;' })).body.error.code, 'VALIDATION_FAILED');
  const storedText = "Trà ' OR 1=1 --";
  assert.equal((await request('/api/dishes', { name: storedText, price: 100 })).body.data.name, storedText);
  assert.equal((await request('/api/dishes/paged?q=' + encodeURIComponent("' OR 1=1 --"))).body.data.total, 1);
  assert.equal((await request('/api/dishes/paged?q=' + encodeURIComponent("x' OR 1=1 --"))).body.data.total, 0);
  assert.equal((await request('/api/dishes', undefined, { headers: { Origin: 'https://foreign.example' } })).status, 403);

  const copiedToken = accessToken;
  assert.equal((await auth('logout', undefined, { method: 'POST', headers: { Authorization: '' } })).status, 401);
  assert.equal((await auth('logout', undefined, { method: 'POST' })).body.ok, true);
  accessToken = undefined;
  assert.equal((await request('/api/dishes')).status, 401);
  assert.equal((await request('/api/dishes', undefined, { headers: { Authorization: 'Bearer ' + copiedToken } })).status, 200);
  assert.equal((await request('/api/dishes?access_token=' + copiedToken, undefined, {
    headers: { Cookie: 'soucha_week7_sid=' + copiedToken }
  })).status, 401);
  const [header, payload, signature] = copiedToken.split('.');
  const tampered = [header, payload, (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1)].join('.');
  const wrongAlgorithm = jwt.sign(claims, key, { algorithm: 'HS384' });
  const wrongAudience = jwt.sign({ ...claims, aud: 'wrong-api' }, key, { algorithm: 'HS256' });
  for (const token of [tampered, wrongAlgorithm, wrongAudience]) {
    const rejected = await request('/api/dishes', undefined, { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(rejected.status, 401);
    assert.match(rejected.headers.get('www-authenticate'), /invalid_token/);
  }
  const { exp, ...legacyClaims } = claims;
  const legacyToken = jwt.sign(legacyClaims, key, { algorithm: 'HS256' });
  assert.equal((await request('/api/dishes', undefined, { headers: { Authorization: 'Bearer ' + legacyToken } })).status, 401);
  assert.equal(await app.prisma.session.count(), 0);

  assert.equal((await auth('forgot', { email })).body.ok, true);
  const resetUrl = new URL(await waitForMail('reset'));
  assert.equal(resetUrl.origin, origin);
  const token = resetUrl.searchParams.get('token');
  assert.equal((await auth('reset?token=' + token)).body.ok, true);
  const newPassword = password + '-changed';
  const resetData = { token, password: newPassword, confirmPassword: newPassword };
  assert.equal((await auth('reset', resetData)).body.ok, true);
  assert.equal(await waitForMail('changed'), email);
  // Reset changes the password but cannot revoke a stateless JWT in this exercise.
  assert.equal((await request('/api/dishes', undefined, { headers: { Authorization: 'Bearer ' + copiedToken } })).status, 200);
  assert.equal(code(await auth('reset', resetData)), 'INVALID_RESET');
  assert.equal(code(await login(password)), 'INVALID_CREDENTIALS');
  assert.equal((await login(newPassword)).body.ok, true);
  assert.equal(app.logs.length, 0);
});
