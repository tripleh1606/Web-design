const { test } = require('node:test');
const assert = require('node:assert/strict');
const { registrationFixture } = require('./helpers/registration-fixture');
const { verifyPassword, hashToken, createRecaptchaVerifier } = require('../src/auth/session');
const { normalizeEmail, validEmail, verifyOtp, generateOtp } = require('../src/auth/credentials');
const { registrationPolicy } = require('../src/auth/config');
const { GENERIC_NOTICE } = require('../src/auth/registration');
const crypto = require('node:crypto');

test('R01/R08: new registration stores pending/viewer, original email, Argon2id hashes; no secrets or auth session', async t => {
  const f = await registrationFixture(t);
  const response = await f.register(' Person.Name+Tag@Example.COM ', { role: 'admin', status: 'active', emailVerifiedAt: '2020-01-01' });
  assert.equal(response.status, 200);
  const user = await f.prisma.user.findUnique({ where: { email: 'Person.Name+Tag@example.com' } });
  assert.equal(user.emailOriginal, 'Person.Name+Tag@Example.COM');
  assert.equal(user.role, 'viewer'); assert.equal(user.status, 'pending'); assert.equal(user.emailVerifiedAt, null);
  assert.match(user.passwordHash, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  assert.equal(await verifyPassword('original-password', user.passwordHash), true);
  const message = await f.mail();
  assert.match(message.otp, /^\d{6}$/); assert.equal(message.to, user.emailOriginal);
  const challenge = await f.prisma.activationChallenge.findUnique({ where: { userId: user.id } });
  assert.equal(challenge.purpose, 'activation'); assert.equal(challenge.expiresAt - f.now(), 600000);
  assert.equal(await verifyOtp(message.otp, challenge.otpHash), true);
  assert.equal(challenge.usedAt, null); assert.equal(challenge.attempts, 0);
  for (const secret of [message.otp, user.passwordHash, challenge.otpHash, 'original-password']) assert.equal(response.html.includes(secret), false);
  assert.deepEqual(await f.prisma.session.findMany({ where: { userId: user.id } }), []);
  assert.equal((await f.prisma.session.findMany())[0].userId, null);
  assert.equal(f.captchaCalls[0].action, 'register');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await f.get('/auth/verify-email?token=' + 'a'.repeat(64))).status, 404);
});

test('R02: re-register pending preserves original password; active and new have the same generic notice', async t => {
  const f = await registrationFixture(t);
  const first = await f.register(); await f.mail();
  const user = await f.prisma.user.findUnique({ where: { email: 'Person@example.com' } });
  f.advance(61000);
  const repeated = await f.register('Person@EXAMPLE.com', { password: 'attacker-password', confirmPassword: 'attacker-password' });
  await f.mail(2);
  const same = await f.prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(same.passwordHash, user.passwordHash); assert.equal(await verifyPassword('attacker-password', same.passwordHash), false);
  await f.prisma.user.update({ where: { id: user.id }, data: { status: 'active', emailVerifiedAt: new Date() } });
  const before = await f.prisma.user.findUnique({ where: { id: user.id } });
  f.advance(61000);
  const active = await f.register();
  for (const response of [first, repeated, active]) { assert.equal(response.status, 200); assert.ok(response.html.includes(GENERIC_NOTICE)); }
  assert.deepEqual(await f.prisma.user.findUnique({ where: { id: user.id } }), before);
  assert.equal(await f.prisma.user.count(), 1); assert.equal(f.sent.length, 2);
});

test('validation returns 200 VALIDATION_FAILED, preserves only email, and does not call CAPTCHA or create users', async t => {
  const f = await registrationFixture(t);
  for (const extra of [{ email: 'invalid' }, { password: 'short', confirmPassword: 'short' }, { confirmPassword: 'different' }, { password: 'x'.repeat(129) }]) {
    const response = await f.register('Person@example.com', extra);
    assert.equal(response.status, 200); assert.match(response.html, /data-error-code="VALIDATION_FAILED"/);
    assert.doesNotMatch(response.html, /value="(?:short|different)"/);
  }
  assert.equal(f.captchaCalls.length, 0); assert.equal(await f.prisma.user.count(), 0); assert.equal(f.sent.length, 0);
  assert.equal(normalizeEmail(' A.b+tag@EXAMPLE.COM '), 'A.b+tag@example.com');
  assert.notEqual(normalizeEmail('A@example.com'), normalizeEmail('a@example.com'));
  assert.equal(validEmail('a..b@example.com'), false);
  assert.equal(validEmail('x@example.com\r\nBcc: attacker@example.com'), false);
});

test('C01/C02: missing, invalid, reused CAPTCHA and provider error never create users or send OTP', async t => {
  const f = await registrationFixture(t);
  for (const token of ['', 'wrong-action', 'expired']) {
    const response = await f.register('blocked@example.com', { 'g-recaptcha-response': token, captchaPassed: 'true', score: '1', action: 'register' });
    assert.equal(response.status, 200); assert.match(response.html, /CAPTCHA_INVALID/);
  }
  const error = await f.register('blocked@example.com', { 'g-recaptcha-response': 'provider-error' });
  assert.equal(error.status, 500);
  assert.equal(await f.prisma.user.count(), 0); assert.equal(f.sent.length, 0);
  await f.register('one@example.com', { 'g-recaptcha-response': 'captcha-shared' }); await f.mail();
  const replay = await f.register('two@example.com', { 'g-recaptcha-response': 'captcha-shared' });
  assert.match(replay.html, /CAPTCHA_INVALID/); assert.equal(await f.prisma.user.count(), 1);
});

test('C02: real v3 adapter verifies action/hostname/score/age and fails closed on provider errors', async () => {
  const env = { APP_BASE_URL: 'https://example.com', RECAPTCHA_SITE_KEY: 'site', RECAPTCHA_SECRET_KEY: 'secret' };
  const valid = { success: true, hostname: 'example.com', action: 'register', score: 0.9, challenge_ts: new Date().toISOString() };
  for (const [patch, expected] of [[{}, true], [{ action: 'login' }, false], [{ hostname: 'evil.example' }, false], [{ score: 0.49 }, false], [{ score: '0.9' }, false], [{ challenge_ts: new Date(Date.now() - 121000).toISOString() }, false], [{ success: false, 'error-codes': ['timeout-or-duplicate'] }, false]]) {
    const verifier = createRecaptchaVerifier(env, async () => ({ ok: true, json: async () => ({ ...valid, ...patch }) }));
    assert.equal((await verifier.verifyToken('token', '127.0.0.1', 'register')).ok, expected);
  }
  for (const response of [async () => { throw new Error('offline'); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } })]) {
    assert.equal((await createRecaptchaVerifier(env, response).verifyToken('x', '', 'register')).reason, 'network-error');
  }
  assert.throws(() => createRecaptchaVerifier({ RECAPTCHA_ADAPTER: 'cloud' }), /v3/);
  assert.throws(() => registrationPolicy({ otpMaxAttempts: 0 }), /ACTIVATION_MAX_ATTEMPTS/);
  for (let i = 0; i < 10; i++) assert.match(generateOtp(), /^\d{6}$/);
});

test('CSRF protects register, activate and resend; forged/expired anonymous cookies do not authenticate', async t => {
  const f = await registrationFixture(t);
  for (const path of ['/register', '/activate', '/activate/resend']) {
    assert.equal((await f.post(path, { email: 'x@example.com', _csrf: '' })).status, 403);
    assert.equal((await f.post(path, { email: 'other@example.com' }, { origin: 'https://evil.example' })).status, 403);
  }
  const { cookie, csrf } = f.credentials();
  await f.prisma.session.update({ where: { tokenHash: hashToken(cookie.split('=')[1]) }, data: { expiresAt: new Date(0) } });
  assert.equal((await f.register()).status, 403);
  assert.equal((await f.post('/activate', { email: 'a@example.com', _csrf: csrf }, { cookie: 'soucha_csrf=' + 'a'.repeat(64) })).status, 403);
  assert.equal(await f.prisma.user.count(), 0);
});

test('R04/R07: correct OTP atomically activates once without login; replay fails without reverting active', async t => {
  const f = await registrationFixture(t); await f.register(); const message = await f.mail();
  const response = await f.post('/activate', { email: 'Person@EXAMPLE.COM', otp: message.otp });
  assert.equal(response.status, 200); assert.match(response.html, /Kích hoạt thành công/); assert.match(response.html, /href="\/login"/);
  const user = await f.prisma.user.findUnique({ where: { email: 'Person@example.com' } });
  assert.equal(user.status, 'active'); assert.ok(user.emailVerifiedAt);
  const challenge = await f.prisma.activationChallenge.findUnique({ where: { userId: user.id } });
  assert.deepEqual(challenge.usedAt, user.emailVerifiedAt);
  assert.equal((await f.prisma.session.findMany({ where: { userId: user.id } })).length, 0);
  assert.equal(response.headers.get('set-cookie'), null);
  const replay = await f.post('/activate', { email: user.email, otp: message.otp });
  assert.match(replay.html, /INVALID_OTP/); assert.equal((await f.prisma.user.findUnique({ where: { id: user.id } })).status, 'active');
});

test('R05: wrong, expired, used, wrong-purpose and unknown OTP return the same error', async t => {
  const f = await registrationFixture(t); await f.register(); const message = await f.mail();
  const user = await f.prisma.user.findUnique({ where: { email: 'Person@example.com' } });
  const responses = [await f.post('/activate', { email: user.email, otp: 'not-an-otp' })];
  for (const data of [{ expiresAt: new Date(0) }, { expiresAt: new Date(f.now() + 10000), usedAt: new Date() }, { usedAt: null, purpose: 'password-reset' }]) {
    await f.prisma.activationChallenge.update({ where: { userId: user.id }, data });
    responses.push(await f.post('/activate', { email: user.email, otp: message.otp }));
  }
  responses.push(await f.post('/activate', { email: 'unknown@example.com', otp: message.otp }));
  for (const response of responses) { assert.equal(response.status, 200); assert.match(response.html, /INVALID_OTP/); }
  assert.equal((await f.prisma.user.findUnique({ where: { id: user.id } })).status, 'pending');
  assert.equal(await f.prisma.user.count(), 1);
});

test('R05/C07: pending/active/unknown share five-failure lock across activate, resend and register', async t => {
  for (const state of ['pending', 'active', 'unknown']) {
    const f = await registrationFixture(t);
    if (state !== 'unknown') { await f.register(); await f.mail(); }
    const user = await f.prisma.user.findUnique({ where: { email: 'Person@example.com' } });
    if (state === 'active') await f.prisma.user.update({ where: { id: user.id }, data: { status: 'active', emailVerifiedAt: new Date() } });
    for (let i = 1; i <= 5; i++) {
      const response = await f.post('/activate', { email: ' Person@EXAMPLE.COM ', otp: 'invalid' });
      assert.equal(response.status, i === 5 ? 429 : 200);
    }
    f.advance(61000);
    assert.equal((await f.post('/activate/resend', { email: 'Person@example.com' })).status, 429);
    assert.equal((await f.register()).status, 429);
    assert.equal((await f.post('/activate', { email: 'Person@example.com', otp: '123456' })).status, 429);
    const attempt = await f.prisma.activationAttempt.findUnique({ where: { emailKey: hashToken('Person@example.com') } });
    assert.equal(attempt.attempts, 5); assert.equal(attempt.lockedUntil - f.now(), 839000);
    if (user) {
      const challenge = await f.prisma.activationChallenge.findUnique({ where: { userId: user.id } });
      assert.equal(challenge.attempts, 5); assert.deepEqual(challenge.lockedUntil, attempt.lockedUntil);
    }
  }
});

test('R06: resend and re-register share cooldown, invalidate old OTP and preserve failure budget', async t => {
  const f = await registrationFixture(t); await f.register(); const old = await f.mail();
  assert.equal((await f.post('/activate/resend', { email: 'Person@example.com' })).status, 429);
  assert.equal((await f.register()).status, 429);
  await f.post('/activate', { email: 'Person@example.com', otp: 'invalid' });
  f.advance(61000);
  assert.equal((await f.post('/activate/resend', { email: 'Person@example.com' })).status, 200);
  const newer = await f.mail(2);
  assert.notEqual(old.otp, newer.otp);
  const user = await f.prisma.user.findUnique({ where: { email: 'Person@example.com' } });
  const challenge = await f.prisma.activationChallenge.findUnique({ where: { userId: user.id } });
  assert.equal(challenge.attempts, 1);
  assert.equal(await verifyOtp(old.otp, challenge.otpHash), false);
  assert.match((await f.post('/activate', { email: user.email, otp: old.otp })).html, /INVALID_OTP/);
  assert.match((await f.post('/activate', { email: user.email, otp: newer.otp })).html, /Kích hoạt thành công/);
});

test('R06: resend rejects a random collision with the previous six-digit OTP', async t => {
  const sequence = [42, 42, 43];
  t.mock.method(crypto, 'randomInt', () => sequence.shift());
  const f = await registrationFixture(t); await f.register(); const old = await f.mail();
  assert.equal(old.otp, '000042');
  f.advance(61000);
  await f.post('/activate/resend', { email: 'Person@example.com' });
  const newer = await f.mail(2); assert.equal(newer.otp, '000043');
  assert.match((await f.post('/activate', { email: 'Person@example.com', otp: old.otp })).html, /INVALID_OTP/);
  assert.match((await f.post('/activate', { email: 'Person@example.com', otp: newer.otp })).html, /Kích hoạt thành công/);
});

test('unknown-email failures are inherited by a new challenge; only lock expiry renews budget', async t => {
  const f = await registrationFixture(t);
  for (let i = 0; i < 4; i++) await f.post('/activate', { email: 'Person@example.com', otp: 'invalid' });
  await f.register(); await f.mail();
  const user = await f.prisma.user.findUnique({ where: { email: 'Person@example.com' } });
  assert.equal((await f.prisma.activationChallenge.findUnique({ where: { userId: user.id } })).attempts, 4);
  assert.equal((await f.post('/activate', { email: user.email, otp: 'invalid' })).status, 429);
  f.advance(900001);
  assert.equal((await f.post('/activate/resend', { email: user.email })).status, 200); await f.mail(2);
  const challenge = await f.prisma.activationChallenge.findUnique({ where: { userId: user.id } });
  assert.equal(challenge.attempts, 0); assert.equal(challenge.lockedUntil, null);
});

test('request/email/IP quotas apply before validation and ignore spoofed X-Forwarded-For', async t => {
  const f = await registrationFixture(t);
  for (let i = 0; i < 5; i++) assert.equal((await f.register('invalid')).status, 200);
  const sixth = await f.register('invalid'); assert.equal(sixth.status, 429); assert.ok(Number(sixth.headers.get('retry-after')) > 0);
  const g = await registrationFixture(t);
  for (let i = 0; i < 20; i++) assert.equal((await g.post('/register', { email: `x${i}@example.com` }, { 'x-forwarded-for': `192.0.2.${i}` })).status, 200);
  assert.equal((await g.register('next@example.com')).status, 429);
  const h = await registrationFixture(t, { policy: { otpMaxAttempts: 100 } });
  for (let i = 0; i < 10; i++) assert.equal((await h.post('/activate', { email: 'x@example.com', otp: 'invalid' })).status, 200);
  assert.equal((await h.post('/activate', { email: 'x@example.com', otp: 'invalid' })).status, 429);
});

test('activation mail quotas cover unknown/active/pending, including direct resend calls', async t => {
  for (const state of ['unknown', 'pending', 'active']) {
    const f = await registrationFixture(t);
    if (state !== 'unknown') {
      await f.register(); await f.mail();
      if (state === 'active') {
        const u = await f.prisma.user.findUnique({ where: { email: 'Person@example.com' } });
        await f.prisma.user.update({ where: { id: u.id }, data: { status: 'active', emailVerifiedAt: new Date() } });
      }
    }
    for (let i = state === 'unknown' ? 0 : 1; i < 5; i++) {
      f.advance(61000);
      assert.equal((await f.post('/activate/resend', { email: 'Person@example.com' })).status, 200);
    }
    f.advance(61000);
    assert.equal((await f.post('/activate/resend', { email: 'Person@example.com' })).status, 429);
  }
});

test('IP quotas cover activate and resend across many different emails', async t => {
  const f = await registrationFixture(t);
  for (let i = 0; i < 30; i++) assert.equal((await f.post('/activate', { email: `unknown${i}@example.com`, otp: 'invalid' })).status, 200);
  assert.equal((await f.post('/activate', { email: 'different@example.com', otp: 'invalid' })).status, 429);
  const g = await registrationFixture(t);
  for (let i = 0; i < 20; i++) assert.equal((await g.post('/activate/resend', { email: `unknown${i}@example.com` })).status, 200);
  assert.equal((await g.post('/activate/resend', { email: 'different@example.com' })).status, 429);
});

test('R03/R07: pending cannot login/CRUD; activation does not authenticate; active login requires original password', async t => {
  const f = await registrationFixture(t); await f.register(); const message = await f.mail();
  async function login(password) { return f.post('/login', { email: 'Person@EXAMPLE.com', password, 'g-recaptcha-response': 'captcha-login-' + password }); }
  assert.equal((await login('original-password')).status, 403);
  for (const path of ['/dishes', '/dishes/1', '/admin/dishes', '/admin/dishes/new', '/admin/dishes/1/edit', '/admin/chefs', '/admin/ingredients']) {
    const response = await f.get(path); assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/login');
  }
  for (const path of ['/admin/dishes', '/admin/dishes/1?_method=DELETE', '/admin/dishes/1/ingredients', '/admin/chefs/1/dishes']) {
    assert.equal((await f.post(path)).status, 303);
  }
  await f.post('/activate', { email: 'Person@example.com', otp: message.otp });
  assert.equal((await f.get('/admin/dishes')).status, 303);
  assert.equal((await login(message.otp)).status, 401);
  assert.equal((await f.get('/admin/dishes', { cookie: 'soucha_session=' + message.otp })).status, 303);
  assert.match((await f.post('/reset', { token: message.otp, password: 'new-password', confirmPassword: 'new-password' })).html, /INVALID_RESET_TOKEN/);
  // New CAPTCHA token is required for each POST.
  const result = await f.post('/login', { email: 'Person@example.com', password: 'original-password', 'g-recaptcha-response': 'captcha-login-active' });
  assert.equal(result.status, 303); assert.match(result.headers.get('set-cookie'), /soucha_session=/);
});

test('mail dispatch happens after response, delivery failure stays pending with sanitized logs', async t => {
  let rejectDelivery, started = false;
  const f = await registrationFixture(t, { mailer: { sendActivationOtp() { started = true; return new Promise((_resolve, reject) => { rejectDelivery = reject; }); } } });
  const response = await f.register();
  assert.equal(response.status, 200); assert.ok(response.html.includes(GENERIC_NOTICE));
  for (let i = 0; i < 20 && !started; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, true);
  rejectDelivery(new Error('smtp secret token 123456 password private'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await f.prisma.user.findUnique({ where: { email: 'Person@example.com' } })).status, 'pending');
  assert.match(JSON.stringify(f.logs), /ACTIVATION_MAIL_FAILED/); assert.doesNotMatch(JSON.stringify(f.logs), /123456|private|smtp secret/);
});

test('transaction failure rolls back pending user/challenge and never dispatches mail', async t => {
  const f = await registrationFixture(t);
  f.prisma.activationChallenge.upsert = async () => { throw new Error('transaction failed'); };
  assert.equal((await f.register()).status, 500);
  assert.equal(await f.prisma.user.count(), 0); assert.equal(await f.prisma.activationChallenge.count(), 0); assert.equal(f.sent.length, 0);
});
