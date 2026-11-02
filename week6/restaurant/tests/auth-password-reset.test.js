const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createAuthStore } = require('./helpers/auth-store');
const { hashPassword, verifyPassword, hashToken, generateRawToken } = require('../src/auth/credentials');

async function fixture(run, options = {}) {
  const originalHash = await hashPassword('original-password');
  const users = [
    { id: 1, email: 'User@example.com', emailOriginal: 'User@EXAMPLE.com', passwordHash: originalHash, status: 'active', role: 'viewer', emailVerifiedAt: new Date() },
    { id: 2, email: 'pending@example.com', emailOriginal: 'pending@example.com', passwordHash: originalHash, status: 'pending', role: 'viewer', emailVerifiedAt: null }
  ];
  const prisma = createAuthStore({ users });
  prisma.dish.findMany = async () => [];
  const sent = [], logs = [];
  let finishMail;
  const mailer = {
    isConfigured: () => options.mailConfigured !== false,
    async sendPasswordResetEmail(message) {
      if (options.mailError) throw new Error('private SMTP token must not be logged');
      sent.push({ type: 'reset', ...message });
      if (finishMail) await finishMail;
    },
    async sendPasswordChangedNotice(message) { sent.push({ type: 'notice', ...message }); }
  };
  const app = createApp({ prisma, mailer, logger: { error: (...args) => logs.push(args) },
    authConfig: { appBaseUrl: 'http://localhost:3001' },
    recaptchaVerifier: { async verify() { return { ok: true }; } } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '', csrf = '';
  async function request(path, { data, method, headers, identity } = {}) {
    const response = await fetch(base + path, { redirect: 'manual', method: method || (data ? 'POST' : 'GET'),
      headers: { connection: 'close', cookie: identity?.cookie ?? cookie, ...headers },
      ...(data ? { body: new URLSearchParams(data) } : {}) });
    const html = await response.text();
    const newCookie = response.headers.getSetCookie().find(value => /^sid=[a-f0-9]{64}/.test(value));
    if (newCookie && !identity) cookie = newCookie.split(';')[0];
    if (!identity) csrf = html.match(/name="_csrf" value="([a-f0-9]{64})"/)?.[1] || csrf;
    await new Promise(resolve => setImmediate(resolve));
    return { response, status: response.status, html };
  }
  const get = (path = '/forgot', opts) => request(path, opts);
  async function post(path, data, options = {}) {
    if (!csrf && !options.identity) await get();
    return request(path, { ...options, data: { _csrf: options.identity?.csrf ?? csrf, ...data } });
  }
  async function issue(userId = 1) {
    const raw = generateRawToken();
    const row = await prisma.passwordReset.create({ data: { userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 900000) } });
    return { raw, row };
  }
  async function session(userId = 1) {
    const raw = generateRawToken(), token = generateRawToken();
    await prisma.session.create({ data: { sidHash: hashToken(raw), userId, csrfToken: token,
      createdAt: new Date(), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 3600000) } });
    return { raw, cookie: `sid=${raw}`, csrf: token };
  }
  const forgot = email => post('/forgot', { email });
  const reset = (raw, overrides = {}, opts) => post('/reset', { token: raw, password: 'replacement-password', confirmPassword: 'replacement-password', ...overrides }, opts);
  try { await run({ prisma, users, originalHash, sent, logs, get, post, issue, session, forgot, reset,
    holdMail: promise => { finishMail = promise; } }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('forgot existing/unknown emails share status and body, no raw reset token or SMTP wait', async () => fixture(async ({ forgot, sent, prisma, holdMail }) => {
  let release;
  holdMail(new Promise(resolve => { release = resolve; }));
  const present = await forgot('User@EXAMPLE.com');
  const absent = await forgot('missing@example.com');
  // Only the preserved user-entered email differs.
  assert.equal(present.status, 200); assert.equal(absent.status, 200);
  assert.equal(present.html.replaceAll('User@example.com', 'EMAIL'), absent.html.replaceAll('missing@example.com', 'EMAIL'));
  assert.equal(sent.length, 1); assert.equal(prisma.state.passwordResets.size, 1);
  const raw = new URL(sent[0].resetUrl).searchParams.get('token');
  assert.match(raw, /^[a-f0-9]{64}$/);
  assert.equal(new URL(sent[0].resetUrl).pathname, '/reset');
  assert.equal(present.html.includes(raw), false);
  assert.equal([...prisma.state.passwordResets.values()][0].tokenHash, hashToken(raw));
  release();
}));

test('forgot rate limits apply equally to active, pending and unknown emails across new browser sessions', async () => fixture(async ({ forgot, get }) => {
  for (const email of ['User@example.com', 'pending@example.com', 'unknown@example.com']) {
    for (let i = 0; i < 3; i++) assert.equal((await forgot(email)).status, 200);
    const limited = await forgot(email);
    assert.equal(limited.status, 429); assert.ok(Number(limited.response.headers.get('retry-after')) > 0);
    await get('/forgot');
    assert.equal((await forgot(email)).status, 429);
  }
}));

test('new forgot request invalidates previous reset without changing password or sessions', async () => fixture(async ({ issue, forgot, prisma, originalHash, session }) => {
  const old = await issue(), device = await session();
  assert.equal((await forgot('User@example.com')).status, 200);
  assert.ok(prisma.state.passwordResets.get(old.row.id).invalidatedAt);
  assert.equal(prisma.state.users.get(1).passwordHash, originalHash);
  assert.ok(prisma.state.sessions.has(hashToken(device.raw)));
}));

test('GET/HEAD reset is read-only for valid token; the shared GET/HEAD/POST quota stops lookup before consumption', async () => fixture(async ({ issue, get, reset, prisma, originalHash, session }) => {
  const token = await issue(), device = await session();
  await get('/forgot');
  for (let i = 0; i < 20; i++) {
    const response = await get(`/reset?token=${token.raw}`, { method: i % 2 ? 'HEAD' : 'GET' });
    assert.equal(response.status, 200);
    assert.equal(response.response.headers.get('cache-control'), 'no-store');
    assert.equal(response.response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(prisma.state.passwordResets.get(token.row.id).usedAt, null);
  }
  let lookups = 0;
  const oldFind = prisma.passwordReset.findUnique;
  prisma.passwordReset.findUnique = async opts => { lookups++; return oldFind(opts); };
  assert.equal((await reset(token.raw)).status, 429);
  assert.equal(lookups, 0);
  assert.equal(prisma.state.users.get(1).passwordHash, originalHash);
  assert.ok(prisma.state.sessions.has(hashToken(device.raw)));
}));

test('reset rejects wrong, expired, used and superseded token with same error and no password change', async () => fixture(async ({ issue, reset, prisma, originalHash }) => {
  const states = [{ expiresAt: new Date(0) }, { usedAt: new Date() }, { invalidatedAt: new Date() }];
  const wrong = await reset(generateRawToken());
  assert.equal(wrong.status, 200); assert.match(wrong.html, /INVALID_RESET_TOKEN/);
  for (const state of states) {
    const token = await issue();
    Object.assign(prisma.state.passwordResets.get(token.row.id), state);
    const response = await reset(token.raw);
    assert.equal(response.status, 200); assert.match(response.html, /INVALID_RESET_TOKEN/);
  }
  assert.equal(prisma.state.users.get(1).passwordHash, originalHash);
}));

test('password policy, CSRF and foreign origin stop reset without consuming token', async () => fixture(async ({ issue, reset, prisma, originalHash }) => {
  const token = await issue();
  assert.equal((await reset(token.raw, { password: 'short', confirmPassword: 'short' })).status, 200);
  assert.equal((await reset(token.raw, { confirmPassword: 'different' })).status, 200);
  assert.equal((await reset(token.raw, { _csrf: 'bad' })).status, 403);
  assert.equal((await reset(token.raw, {}, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal(prisma.state.passwordResets.get(token.row.id).usedAt, null);
  assert.equal(prisma.state.users.get(1).passwordHash, originalHash);
}));

test('reset changes only password, consumes once, invalidates other tokens, revokes every user session and redirects without auto login', async () => fixture(async ({ issue, reset, prisma, originalHash, sent, session, get, post }) => {
  const token = await issue(), otherToken = await issue(), a = await session(), b = await session(), otherUser = await session(2);
  const result = await reset(token.raw, {}, { identity: a });
  assert.equal(result.status, 303); assert.equal(result.response.headers.get('location'), '/login');
  assert.match(result.response.headers.get('set-cookie'), /sid=;.*Max-Age=0/);
  const user = prisma.state.users.get(1);
  assert.notEqual(user.passwordHash, originalHash);
  assert.match(user.passwordHash, /^\$argon2id\$/);
  assert.equal(await verifyPassword('replacement-password', user.passwordHash), true);
  assert.equal(user.role, 'viewer'); assert.equal(user.status, 'active'); assert.ok(user.emailVerifiedAt);
  assert.ok(prisma.state.passwordResets.get(token.row.id).usedAt);
  assert.ok(prisma.state.passwordResets.get(otherToken.row.id).invalidatedAt);
  assert.equal(prisma.state.sessions.has(hashToken(a.raw)), false); assert.equal(prisma.state.sessions.has(hashToken(b.raw)), false);
  assert.ok(prisma.state.sessions.has(hashToken(otherUser.raw)));
  assert.equal(sent.filter(message => message.type === 'notice').length, 1);
  assert.equal((await get('/dishes', { identity: a })).status, 303);
  assert.equal((await get('/dishes', { identity: b })).status, 303);
  assert.match((await reset(token.raw)).html, /INVALID_RESET_TOKEN/);
  await get('/login');
  const oldLogin = await post('/login', { email: 'User@example.com', password: 'original-password' });
  assert.equal(oldLogin.status, 200); assert.match(oldLogin.html, /INVALID_CREDENTIALS/);
  assert.equal((await post('/login', { email: 'User@example.com', password: 'replacement-password' })).status, 303);
}));

test('reset pending account preserves pending status and verification, without clearing another signed-in account cookie', async () => fixture(async ({ issue, reset, prisma, session, post, get }) => {
  const token = await issue(2), active = await session(1);
  const result = await reset(token.raw, {}, { identity: active });
  assert.equal(result.status, 303);
  assert.equal(result.response.headers.get('set-cookie'), null);
  assert.equal(prisma.state.users.get(2).status, 'pending');
  assert.equal(prisma.state.users.get(2).emailVerifiedAt, null);
  assert.ok(prisma.state.sessions.has(hashToken(active.raw)));
  await get('/login');
  assert.equal((await post('/login', { email: 'pending@example.com', password: 'replacement-password' })).status, 200);
  assert.equal([...prisma.state.sessions.values()].some(row => row.userId === 2), false);
}));

test('two concurrent reset requests have one successful claim in serialized fixture', async () => fixture(async ({ issue, reset, prisma }) => {
  const token = await issue();
  const results = await Promise.all([reset(token.raw), reset(token.raw)]);
  assert.equal(results.filter(result => result.status === 303).length, 1);
  assert.equal(results.filter(result => result.html.includes('INVALID_RESET_TOKEN')).length, 1);
  assert.ok(prisma.state.passwordResets.get(token.row.id).usedAt);
}));

test('reset transaction rollback restores password, usedAt, other tokens and sessions after store error', async () => fixture(async ({ issue, reset, prisma, originalHash, session }) => {
  const token = await issue(), other = await issue(), device = await session();
  prisma.session.deleteMany = async () => { throw new Error('store unavailable'); };
  assert.equal((await reset(token.raw)).status, 500);
  assert.equal(prisma.state.users.get(1).passwordHash, originalHash);
  assert.equal(prisma.state.passwordResets.get(token.row.id).usedAt, null);
  assert.equal(prisma.state.passwordResets.get(other.row.id).invalidatedAt, null);
  assert.ok(prisma.state.sessions.has(hashToken(device.raw)));
}));

test('reset rechecks fresh expiry after User lock and after asynchronous password hashing', async () => fixture(async ({ issue, reset, prisma, originalHash }) => {
  const token = await issue();
  prisma.$queryRaw = async () => { prisma.state.passwordResets.get(token.row.id).expiresAt = new Date(0); return []; };
  const result = await reset(token.raw);
  assert.match(result.html, /INVALID_RESET_TOKEN/);
  assert.equal(prisma.state.users.get(1).passwordHash, originalHash);
  assert.equal(prisma.state.passwordResets.get(token.row.id).usedAt, null);
}));

test('conditional claim failure does not mutate password or sessions', async () => fixture(async ({ issue, reset, prisma, originalHash, session }) => {
  const token = await issue(), device = await session();
  const updateMany = prisma.passwordReset.updateMany;
  prisma.passwordReset.updateMany = async opts => opts.where.id === token.row.id ? { count: 0 } : updateMany(opts);
  assert.match((await reset(token.raw)).html, /INVALID_RESET_TOKEN/);
  assert.equal(prisma.state.users.get(1).passwordHash, originalHash);
  assert.ok(prisma.state.sessions.has(hashToken(device.raw)));
}));

test('missing mail configuration is an equal technical failure; delivery errors log only safe codes', async () => {
  await fixture(async ({ forgot, prisma }) => {
    assert.equal((await forgot('User@example.com')).status, 500);
    assert.equal((await forgot('missing@example.com')).status, 500);
    assert.equal(prisma.state.passwordResets.size, 0);
  }, { mailConfigured: false });
  await fixture(async ({ forgot, logs }) => {
    assert.equal((await forgot('User@example.com')).status, 200);
    assert.match(JSON.stringify(logs), /SMTP_DELIVERY_FAILED/);
    assert.doesNotMatch(JSON.stringify(logs), /private SMTP token/);
  }, { mailError: true });
});

test('rate limiter/store failures fail closed instead of using an in-memory fallback', async () => fixture(async ({ forgot, prisma }) => {
  prisma.rateLimitBucket.findUnique = async () => { throw new Error('DB unavailable'); };
  assert.equal((await forgot('User@example.com')).status, 500);
  assert.equal(prisma.state.passwordResets.size, 0);
}));
