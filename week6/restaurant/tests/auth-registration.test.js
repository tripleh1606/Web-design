const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { hashPassword, verifyPassword, hashToken } = require('../src/auth/credentials');
const { createAuthStore } = require('./helpers/auth-store');

async function fixture(run, options = {}) {
  const prisma = createAuthStore({ users: options.users || [] });
  const sent = [], logs = [], captchaCalls = [];
  const mailer = {
    isConfigured: () => options.mailConfigured !== false,
    async sendActivationOtp(message) {
      if (options.mailError) throw new Error('provider secret and OTP must never reach the log');
      sent.push(message);
      if (options.mailPending) await options.mailPending;
    }
  };
  const recaptchaVerifier = {
    async verify(token, action) {
      captchaCalls.push({ token, action });
      return token === 'valid-register' && action === 'register' ? { ok: true }
        : { ok: false, reason: token === 'outage' ? 'unavailable' : 'invalid' };
    }
  };
  const server = createApp({ prisma, mailer, recaptchaVerifier, logger: { error: (...args) => logs.push(args) },
    authConfig: { appBaseUrl: 'http://localhost:3001', recaptchaSiteKey: 'public-v2-test' } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '', csrf = '';
  async function get(path = '/register') {
    const response = await fetch(base + path, { redirect: 'manual', headers: { cookie } });
    const html = await response.text();
    const setCookie = response.headers.get('set-cookie');
    if (setCookie?.match(/sid=([a-f0-9]{64})/)) cookie = `sid=${setCookie.match(/sid=([a-f0-9]{64})/)[1]}`;
    csrf = html.match(/name="_csrf" value="([a-f0-9]{64})"/)?.[1] || csrf;
    return { status: response.status, response, html };
  }
  async function post(path, data, { wrongCsrf = false, origin } = {}) {
    if (!csrf) await get();
    const response = await fetch(base + path, { method: 'POST', redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}) },
      body: new URLSearchParams({ _csrf: wrongCsrf ? 'bad' : csrf, ...data }) });
    const html = await response.text();
    await new Promise(resolve => setImmediate(resolve));
    return { response, html, status: response.status };
  }
  const register = (data = {}, opts) => post('/register', {
    email: ' Lam.Quang+demo@EXAMPLE.com ', password: 'initial-password', confirmPassword: 'initial-password',
    'g-recaptcha-response': 'valid-register', ...data
  }, opts);
  function clearDispatchCooldown() {
    for (const [key, value] of prisma.state.buckets) {
      if (key.startsWith('activation-send:email:')) value.nextAllowedAt = new Date(0);
    }
  }
  try { await run({ prisma, sent, logs, captchaCalls, get, post, register, clearDispatchCooldown }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('registration normalizes only email domain, ignores role/status, hashes secrets and never authenticates', async () => fixture(async ({ register, prisma, sent, captchaCalls, get }) => {
  const result = await register({ role: 'admin', status: 'active', emailVerifiedAt: '2020-01-01' });
  assert.equal(result.status, 200);
  const [user] = prisma.state.users.values(), challenge = prisma.state.challenges.get(user.id);
  assert.equal(user.email, 'Lam.Quang+demo@example.com');
  assert.equal(user.emailOriginal, 'Lam.Quang+demo@EXAMPLE.com');
  assert.equal(user.role, 'viewer'); assert.equal(user.status, 'pending'); assert.equal(user.emailVerifiedAt, null);
  assert.match(user.passwordHash, /^\$argon2id\$/);
  assert.equal(await verifyPassword('initial-password', user.passwordHash), true);
  assert.match(sent[0].otp, /^\d{6}$/);
  assert.equal(await verifyPassword(sent[0].otp, challenge.otpHash), true);
  assert.equal(challenge.purpose, 'activation');
  assert.ok(challenge.expiresAt - challenge.lastSentAt === 600000);
  assert.equal(result.html.includes(`value="${sent[0].otp}"`), false);
  assert.equal([...prisma.state.sessions.values()].filter(s => s.userId != null).length, 0);
  assert.equal((await get('/dishes')).status, 303);
  assert.equal(captchaCalls[0].action, 'register');
}));

test('validation, CSRF and CAPTCHA failures cannot create a user or send OTP; provider failures are technical', async () => fixture(async ({ register, prisma, sent, captchaCalls }) => {
  const invalid = await register({ email: 'not-an-email' });
  assert.equal(invalid.status, 200); assert.match(invalid.html, /VALIDATION_FAILED/);
  assert.equal(captchaCalls.length, 0);
  assert.equal((await register({}, { wrongCsrf: true })).status, 403);
  assert.equal((await register({}, { origin: 'https://evil.example' })).status, 403);
  const missing = await register({ 'g-recaptcha-response': '', captchaPassed: 'true', action: 'register', score: '1' });
  assert.equal(missing.status, 200); assert.match(missing.html, /INVALID_CAPTCHA/);
  assert.equal((await register({ 'g-recaptcha-response': 'outage' })).status, 500);
  assert.equal(prisma.state.users.size, 0); assert.equal(sent.length, 0); assert.equal(prisma.state.challenges.size, 0);
}));

test('repeat pending registration preserves original password and shares resend cooldown and OTP generation', async () => fixture(async ({ register, prisma, sent, post, clearDispatchCooldown }) => {
  await register();
  const user = [...prisma.state.users.values()][0], originalHash = user.passwordHash, firstOtp = sent[0].otp;
  assert.equal((await post('/activate/resend', { email: user.email })).status, 429);
  clearDispatchCooldown();
  assert.equal((await register({ password: 'different-password', confirmPassword: 'different-password' })).status, 200);
  assert.equal(prisma.state.users.size, 1); assert.equal(user.passwordHash, originalHash);
  assert.equal(await verifyPassword('different-password', user.passwordHash), false);
  const challenge = prisma.state.challenges.get(user.id);
  assert.equal(await verifyPassword(sent[1].otp, challenge.otpHash), true);
  if (sent[1].otp !== firstOtp) assert.equal(await verifyPassword(firstOtp, challenge.otpHash), false);
}));

test('valid OTP activates atomically without login; replay is generic INVALID_OTP', async () => fixture(async ({ register, prisma, sent, post, get }) => {
  await register();
  const user = [...prisma.state.users.values()][0];
  const data = { email: user.email, otp: sent[0].otp };
  const responses = await Promise.all([post('/activate', data), post('/activate', data)]);
  assert.equal(responses.filter(r => r.html.includes('Tài khoản đã được kích hoạt')).length, 1);
  assert.equal(responses.filter(r => r.html.includes('INVALID_OTP')).length, 1);
  assert.equal(user.status, 'active'); assert.ok(user.emailVerifiedAt instanceof Date);
  assert.ok(prisma.state.challenges.get(user.id).usedAt instanceof Date);
  assert.equal([...prisma.state.sessions.values()].filter(s => s.userId != null).length, 0);
  assert.equal((await get('/dishes')).status, 303);
  const replay = await post('/activate', data); assert.equal(replay.status, 200); assert.match(replay.html, /INVALID_OTP/);
}));

test('expired OTP or wrong purpose cannot activate; resend preserves attempts and old OTP expires', async () => fixture(async ({ register, prisma, sent, post, clearDispatchCooldown }) => {
  await register();
  const user = [...prisma.state.users.values()][0], challenge = prisma.state.challenges.get(user.id), firstOtp = sent[0].otp;
  challenge.expiresAt = new Date(0);
  assert.match((await post('/activate', { email: user.email, otp: firstOtp })).html, /INVALID_OTP/);
  challenge.expiresAt = new Date(Date.now() + 600000); challenge.purpose = 'reset';
  assert.match((await post('/activate', { email: user.email, otp: firstOtp })).html, /INVALID_OTP/);
  assert.equal(user.status, 'pending'); assert.equal(challenge.attempts, 2);
  clearDispatchCooldown();
  assert.equal((await post('/activate/resend', { email: user.email })).status, 200);
  assert.equal(challenge.attempts, 2); assert.equal(challenge.purpose, 'activation');
  assert.equal(await verifyPassword(sent[1].otp, challenge.otpHash), true);
}));

test('OTP expiring while waiting for the user row lock cannot activate', async () => fixture(async ({ register, prisma, sent, post }) => {
  await register();
  const user = [...prisma.state.users.values()][0], challenge = prisma.state.challenges.get(user.id);
  prisma.$queryRaw = async () => {
    challenge.expiresAt = new Date(Date.now() + 60);
    await new Promise(resolve => setTimeout(resolve, 150));
    return [];
  };
  const result = await post('/activate', { email: user.email, otp: sent[0].otp });
  assert.equal(result.status, 200); assert.match(result.html, /INVALID_OTP/);
  assert.equal(user.status, 'pending'); assert.equal(user.emailVerifiedAt, null); assert.equal(challenge.usedAt, null);
}));

test('OTP expiring during Argon verification is checked with fresh time before consumption', async () => fixture(async ({ register, prisma, sent, post }) => {
  await register();
  const user = [...prisma.state.users.values()][0], challenge = prisma.state.challenges.get(user.id);
  const readChallenge = prisma.activationChallenge.findUnique;
  prisma.activationChallenge.findUnique = async args => {
    challenge.expiresAt = new Date(Date.now() + 1);
    return readChallenge.call(prisma.activationChallenge, args);
  };
  const result = await post('/activate', { email: user.email, otp: sent[0].otp });
  assert.equal(result.status, 200); assert.match(result.html, /INVALID_OTP/);
  assert.equal(user.status, 'pending'); assert.equal(challenge.usedAt, null);
}));

test('atomic OTP claim must succeed before the user is activated', async () => fixture(async ({ register, prisma, sent, post }) => {
  await register();
  const user = [...prisma.state.users.values()][0], challenge = prisma.state.challenges.get(user.id);
  const claim = prisma.activationChallenge.updateMany;
  prisma.activationChallenge.updateMany = async args => {
    if (args.data.usedAt) challenge.expiresAt = new Date(0);
    return claim.call(prisma.activationChallenge, args);
  };
  const result = await post('/activate', { email: user.email, otp: sent[0].otp });
  assert.equal(result.status, 200); assert.match(result.html, /INVALID_OTP/);
  assert.equal(user.status, 'pending'); assert.equal(challenge.usedAt, null);
}));

for (const kind of ['pending', 'active', 'unknown']) {
  test(`OTP attempt lock applies to ${kind} email and cannot be reset with resend/register`, async () => {
    const users = kind === 'unknown' ? [] : [{ id: 1, email: 'person@example.com', emailOriginal: 'person@example.com',
      passwordHash: await hashPassword('unchanged-password'), status: kind, role: 'viewer', emailVerifiedAt: kind === 'active' ? new Date() : null }];
    await fixture(async ({ prisma, post, register, clearDispatchCooldown }) => {
      if (kind === 'pending') {
        await register({ email: 'person@example.com' }); clearDispatchCooldown();
      }
      for (let n = 1; n <= 5; n++) {
        const result = await post('/activate', { email: 'person@example.com', otp: 'not-six-digits' });
        assert.equal(result.status, n === 5 ? 429 : 200);
      }
      const budget = prisma.state.activationAttempts.get(hashToken('person@example.com'));
      assert.equal(budget.attempts, 5); assert.ok(budget.lockedUntil > new Date());
      assert.equal((await post('/activate/resend', { email: 'person@example.com' })).status, 429);
      assert.equal((await register({ email: 'person@example.com' })).status, 429);
      assert.equal(budget.attempts, 5);
      if (kind === 'active') assert.equal(prisma.state.users.get(1).status, 'active');
      if (kind === 'unknown') assert.equal(prisma.state.users.size, 0);
    }, { users });
  });
}

test('register active and new emails return identical generic body and apply same send cooldown', async () => {
  const active = { id: 1, email: 'active@example.com', emailOriginal: 'active@example.com', status: 'active', role: 'viewer',
    emailVerifiedAt: new Date(), passwordHash: await hashPassword('active-password') };
  await fixture(async ({ register, post, sent, prisma }) => {
    const existing = await register({ email: active.email });
    const fresh = await register({ email: 'new@example.com' });
    assert.equal(existing.status, 200); assert.equal(fresh.status, 200);
    assert.equal(existing.html.replaceAll(active.email, 'EMAIL'), fresh.html.replaceAll('new@example.com', 'EMAIL'));
    assert.equal(sent.length, 1); assert.equal(prisma.state.users.get(1).passwordHash, active.passwordHash);
    assert.equal((await post('/activate/resend', { email: active.email })).status, 429);
    assert.equal((await post('/activate/resend', { email: 'new@example.com' })).status, 429);
  }, { users: [active] });
});

test('register and resend share hourly dispatch limits; unknown emails receive identical quota state', async () => fixture(async ({ post, prisma, clearDispatchCooldown }) => {
  for (let n = 0; n < 5; n++) {
    assert.equal((await post('/activate/resend', { email: 'unknown@example.com' })).status, 200);
    clearDispatchCooldown();
  }
  const denied = await post('/activate/resend', { email: 'unknown@example.com' });
  assert.equal(denied.status, 429); assert.match(denied.html, /RATE_LIMITED/);
  assert.equal(prisma.state.users.size, 0);
}));

test('missing mail setup fails before mutation; asynchronous delivery failure logs no provider data', async () => {
  await fixture(async ({ register, prisma }) => {
    assert.equal((await register()).status, 500);
    assert.equal(prisma.state.users.size, 0); assert.equal(prisma.state.challenges.size, 0);
  }, { mailConfigured: false });
  await fixture(async ({ register, logs, prisma }) => {
    assert.equal((await register()).status, 200);
    assert.equal(prisma.state.users.size, 1);
    assert.deepEqual(logs, [['Activation email delivery failed', 'SMTP_DELIVERY_FAILED']]);
  }, { mailError: true });
});
