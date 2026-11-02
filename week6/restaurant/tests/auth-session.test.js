const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAuthStore } = require('./helpers/auth-store');
const { resolveAuthConfig, POLICY } = require('../src/auth/config');
const { normalizeEmail, hashPassword, verifyPassword, hashToken } = require('../src/auth/credentials');
const { attachSessionMiddleware, requireLogin, requireCsrf, clearSessionCookie } = require('../src/auth/session');
const { createLoginRouter } = require('../src/auth/login');
const { createRecaptchaVerifier } = require('../src/auth/captcha');

async function fixture(run) {
  const passwordHash = await hashPassword('password123');
  const prisma = createAuthStore({ users: [{ id: 1, email: 'user@example.com', emailOriginal: 'user@example.com',
    passwordHash, status: 'active', role: 'viewer', emailVerifiedAt: new Date() }] });
  const config = resolveAuthConfig({ appBaseUrl: 'http://localhost:3001', recaptchaSiteKey: 'public-test' });
  const proofs = [];
  const verifier = { async verify(token, action) {
    proofs.push({ token, action });
    return token === 'valid' ? { ok: true } : { ok: false, reason: token === 'outage' ? 'unavailable' : 'invalid' };
  } };
  const app = express();
  let clockOverride;
  const clock = () => clockOverride ? new Date(clockOverride) : new Date();
  app.use(express.urlencoded({ extended: false }));
  // Expose view models only in this test harness, never in the production app.
  app.use((_req, res, next) => { res.render = function (view, model) { return this.json({ view, ...model, csrfToken: this.locals.csrfToken }); }; next(); });
  app.use(attachSessionMiddleware({ prisma, authConfig: config, clock }));
  app.use(createLoginRouter({ prisma, authConfig: config, recaptchaVerifier: verifier }));
  app.get('/protected', requireLogin, (_req, res) => res.sendStatus(200));
  app.post('/protected', requireLogin, requireCsrf, (_req, res) => res.sendStatus(200));
  app.post('/revoke', requireLogin, requireCsrf, async (req, res) => {
    await prisma.session.deleteMany({ where: { sidHash: req.auth.session.sidHash } });
    clearSessionCookie(res, config); res.redirect(303, '/login');
  });
  app.use((_error, _req, res, _next) => res.sendStatus(500));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  async function form(cookie) {
    const response = await request('/login', { headers: cookie ? { cookie } : {} });
    const model = await response.json();
    const newCookie = response.headers.getSetCookie().find(value => /^sid=[a-f0-9]/.test(value));
    return { cookie: newCookie ? newCookie.split(';')[0] : cookie, csrf: model.csrfToken };
  }
  async function login(email = 'user@example.com', password = 'password123', options = {}) {
    const identity = options.identity || await form();
    const response = await request('/login', { method: 'POST', headers: {
      cookie: identity.cookie, 'content-type': 'application/x-www-form-urlencoded', ...(options.origin ? { origin: options.origin } : {})
    }, body: new URLSearchParams({ email, password, _csrf: options.noCsrf ? '' : identity.csrf,
      'g-recaptcha-response': options.token || '' }) });
    return { response, identity };
  }
  try { await run({ prisma, config, proofs, verifier, request, form, login, setClock: value => { clockOverride = value; } }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('email policy preserves local part and Argon2id hashes are salted', async () => {
  assert.equal(normalizeEmail(' User+tag@EXAMPLE.COM '), 'User+tag@example.com');
  const a = await hashPassword('same-password'), b = await hashPassword('same-password');
  assert.match(a, /^\$argon2id\$/); assert.notEqual(a, b);
  assert.equal(await verifyPassword('same-password', a), true);
  assert.equal(await verifyPassword('wrong', a), false);
});

test('v2 adapter accepts success without action/score and rejects wrong hostname, replay and provider errors', async () => {
  const config = { appBaseUrl: 'https://example.com', recaptchaSiteKey: 'site', recaptchaSecretKey: 'secret' };
  let result = { success: true, hostname: 'example.com' };
  let sent;
  const adapter = createRecaptchaVerifier(config, async (url, options) => {
    assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
    assert.equal(options.redirect, 'error'); sent = options.body;
    return { ok: true, async json() { return result; } };
  });
  assert.equal((await adapter.verify('proof', 'register')).ok, true);
  assert.equal(sent.get('secret'), 'secret');
  assert.equal((await adapter.verify('proof', 'unknown-purpose')).ok, false);
  for (const bad of [{ ...result, hostname: 'evil.example' }, { success: false, 'error-codes': ['timeout-or-duplicate'] }]) {
    result = bad; assert.equal((await adapter.verify('proof', 'register')).ok, false);
  }
  assert.equal((await createRecaptchaVerifier({}, async () => {}).verify('proof', 'login')).reason, 'unavailable');
  assert.equal((await createRecaptchaVerifier(config, async () => { throw new Error('offline'); }).verify('proof', 'login')).reason, 'unavailable');
});

test('login rotates anonymous sid, rejects old sid and preserves another user session', async () => fixture(async ({ login, request, prisma }) => {
  const { response, identity } = await login();
  assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/admin/dishes');
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.notEqual(cookie, identity.cookie);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal(prisma.state.sessions.has(hashToken(identity.cookie.slice(4))), false);
  assert.equal((await request('/protected', { headers: { cookie: identity.cookie } })).status, 303);
  assert.equal((await request('/protected', { headers: { cookie } })).status, 200);
  const second = (await login()).response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/protected', { headers: { cookie } })).status, 200);
  assert.equal((await request('/protected', { headers: { cookie: second } })).status, 200);
}));

test('three failures require server CAPTCHA; tenth locks even correct credentials', async () => fixture(async ({ login, prisma, proofs }) => {
  for (let i = 0; i < 3; i++) assert.equal((await login('user@example.com', 'wrong')).response.status, 200);
  const key = hashToken('user@example.com');
  assert.equal(prisma.state.attempts.get(key).failedCount, 3);
  const missing = (await login()).response;
  assert.equal(missing.status, 200); assert.equal((await missing.json()).errorCode, 'INVALID_CAPTCHA');
  assert.equal(prisma.state.attempts.get(key).failedCount, 3);
  for (let i = 3; i < 10; i++) {
    const response = (await login('user@example.com', 'wrong', { token: 'valid' })).response;
    assert.equal(response.status, i === 9 ? 429 : 200);
  }
  const calls = proofs.length;
  assert.equal((await login('user@example.com', 'password123', { token: 'valid' })).response.status, 429);
  assert.equal(proofs.length, calls, 'locked requests do not even call Google');
  prisma.state.attempts.get(key).lockedUntil = new Date(Date.now() - 1);
  assert.equal((await (await login()).response.json()).errorCode, 'INVALID_CAPTCHA');
  assert.equal((await login('user@example.com', 'password123', { token: 'valid' })).response.status, 303);
  assert.equal(prisma.state.attempts.has(key), false);
  assert.ok([...prisma.state.buckets.values()].some(row => row.count > 10), 'success retains IP requests');
}));

test('pending correct password never authenticates or clears failures', async () => fixture(async ({ login, prisma }) => {
  prisma.state.users.get(1).status = 'pending'; prisma.state.users.get(1).emailVerifiedAt = null;
  await login('user@example.com', 'wrong');
  const response = (await login()).response;
  assert.equal(response.status, 200); assert.match((await response.json()).notice, /OTP/);
  assert.equal([...prisma.state.sessions.values()].filter(row => row.userId !== null).length, 0);
  assert.equal(prisma.state.attempts.get(hashToken('user@example.com')).failedCount, 1);
}));

test('unknown and incorrect passwords have identical error; provider failure stops verification', async () => fixture(async ({ login, prisma }) => {
  const unknown = await (await login('missing@example.com', 'wrong')).response.json();
  const known = await (await login('user@example.com', 'wrong')).response.json();
  assert.deepEqual(unknown.errors, known.errors); assert.equal(unknown.errorCode, known.errorCode);
  prisma.state.attempts.get(hashToken('user@example.com')).failedCount = 3;
  const failure = (await login('user@example.com', 'password123', { token: 'outage' })).response;
  assert.equal(failure.status, 500); assert.equal(prisma.state.attempts.get(hashToken('user@example.com')).failedCount, 3);
}));

test('idle and absolute expiration, deletion race and store errors fail closed', async () => fixture(async ({ login, request, prisma, config }) => {
  for (const expired of ['idle', 'absolute', 'deleted-race']) {
    const response = (await login()).response, cookie = response.headers.get('set-cookie').split(';')[0];
    const sidHash = hashToken(cookie.slice(4)), row = prisma.state.sessions.get(sidHash);
    if (expired === 'idle') row.lastSeenAt = new Date(Date.now() - config.sessionIdleMs - 1);
    if (expired === 'absolute') row.expiresAt = new Date(Date.now() - 1);
    const originalTouch = prisma.session.updateMany;
    if (expired === 'deleted-race') prisma.session.updateMany = async () => { prisma.state.sessions.delete(sidHash); return { count: 0 }; };
    assert.equal((await request('/protected', { headers: { cookie } })).status, 303);
    assert.equal(prisma.state.sessions.has(sidHash), false);
    prisma.session.updateMany = originalTouch;
  }
  const cookie = (await login()).response.headers.get('set-cookie').split(';')[0];
  prisma.session.findUnique = async () => { throw new Error('store offline'); };
  assert.equal((await request('/protected', { headers: { cookie } })).status, 500);
}));

test('CSRF and foreign origin rejected; IP limit includes malformed requests', async () => fixture(async ({ login, request, form }) => {
  assert.equal((await login('user@example.com', 'password123', { noCsrf: true })).response.status, 403);
  assert.equal((await login('user@example.com', 'password123', { origin: 'https://evil.example' })).response.status, 403);
  const identity = await form();
  for (let i = 2; i < POLICY.loginIpLimit; i++) assert.equal((await login('not-email', 'x', { identity })).response.status, 200);
  const response = (await login('user@example.com', 'password123', { identity })).response;
  assert.equal(response.status, 429); assert.ok(Number(response.headers.get('retry-after')) > 0);
  assert.equal((await request('/protected')).status, 303);
}));

test('Google verification runs outside transactions and email locks', { timeout: 5000 }, async () => fixture(async ({ prisma, verifier, login }) => {
  const key = hashToken('user@example.com');
  prisma.state.attempts.set(key, { emailKey: key, failedCount: 3, windowStartedAt: new Date(), lockedUntil: null });
  let activeTransactions = 0, started, finish;
  const entered = new Promise(resolve => { started = resolve; });
  const heldProof = new Promise(resolve => { finish = resolve; });
  const transaction = prisma.$transaction.bind(prisma);
  prisma.$transaction = (fn, options) => transaction(async tx => {
    activeTransactions++;
    try { return await fn(tx); } finally { activeTransactions--; }
  }, options);
  verifier.verify = async () => { started(); await heldProof; return { ok: true }; };
  const pending = login('user@example.com', 'password123', { token: 'valid' });
  await entered;
  assert.equal(activeTransactions, 0, 'provider promise must not hold a transaction');
  await prisma.$transaction(async () => assert.equal(activeTransactions, 1));
  finish();
  assert.equal((await pending).response.status, 303);
}));

test('a threshold crossed after the snapshot cannot bypass CAPTCHA or check password', async () => fixture(async ({ prisma, login, proofs }) => {
  const key = hashToken('user@example.com');
  const transaction = prisma.$transaction.bind(prisma);
  let transactionCount = 0, userReads = 0;
  const findUser = prisma.user.findUnique.bind(prisma.user);
  prisma.user.findUnique = async options => { userReads++; return findUser(options); };
  prisma.$transaction = async (fn, options) => {
    const count = ++transactionCount;
    const result = await transaction(fn, options);
    if (count === 2) prisma.state.attempts.set(key, {
      emailKey: key, failedCount: 3, windowStartedAt: new Date(), lockedUntil: null
    });
    return result;
  };
  const response = (await login()).response;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).errorCode, 'INVALID_CAPTCHA');
  assert.equal(proofs.length, 0, 'a proof was not required by the earlier snapshot');
  assert.equal(userReads, 0, 'do not read/verify credentials after the threshold changed');
  assert.equal(prisma.state.attempts.get(key).failedCount, 3);
}));

test('overlapping session touches cannot move lastSeenAt backwards or expire a newer request early', { timeout: 5000 },
  async () => fixture(async ({ prisma, login, request, setClock, config }) => {
    const cookie = (await login()).response.headers.get('set-cookie').split(';')[0];
    const sidHash = hashToken(cookie.slice(4));
    const before = Date.now() + 100, newer = before + 1000;
    setClock(before);
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const update = prisma.session.updateMany.bind(prisma.session);
    let first = true;
    prisma.session.updateMany = async options => {
      if (first) { first = false; enter(); await held; }
      return update(options);
    };
    const olderRequest = request('/protected', { headers: { cookie } });
    await entered;
    setClock(newer);
    assert.equal((await request('/protected', { headers: { cookie } })).status, 200);
    assert.equal(+prisma.state.sessions.get(sidHash).lastSeenAt, newer);
    release();
    assert.equal((await olderRequest).status, 200, 'a monotonic no-op is not mistaken for revocation');
    assert.equal(+prisma.state.sessions.get(sidHash).lastSeenAt, newer, 'older completion cannot replace the newer timestamp');
    setClock(before + config.sessionIdleMs + 500);
    assert.equal((await request('/protected', { headers: { cookie } })).status, 200, 'newer activity keeps the row alive');
  }));

test('session read latency is included when evaluating idle expiry', async () => fixture(async ({ prisma, login, request, setClock, config }) => {
  const cookie = (await login()).response.headers.get('set-cookie').split(';')[0];
  const sidHash = hashToken(cookie.slice(4)), row = prisma.state.sessions.get(sidHash);
  const before = +row.lastSeenAt;
  setClock(before + config.sessionIdleMs - 1);
  const find = prisma.session.findUnique.bind(prisma.session);
  prisma.session.findUnique = async options => {
    const result = await find(options);
    setClock(before + config.sessionIdleMs + 1);
    return result;
  };
  assert.equal((await request('/protected', { headers: { cookie } })).status, 303);
  assert.equal(prisma.state.sessions.has(sidHash), false);
}));
