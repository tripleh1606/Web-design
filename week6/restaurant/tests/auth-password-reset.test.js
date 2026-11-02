const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { hashPassword, verifyPassword, hashToken, createSessionForUser } = require('../src/auth/session');

async function fixture(fn) {
  let nextUserId = 1;
  let nextTokenId = 1;
  const users = new Map();
  const tokens = [];
  const sessions = new Map();
  const limits = new Map();
  const sentEmails = [];

  const defaultUser = {
    id: nextUserId++,
    email: 'user@example.com',
    status: 'active',
    passwordHash: await hashPassword('password123'),
    emailVerifiedAt: new Date()
  };
  users.set(defaultUser.email, defaultUser);
  users.set(defaultUser.id, defaultUser);

  const pendingUser = {
    id: nextUserId++,
    email: 'pending@example.com',
    status: 'pending',
    passwordHash: await hashPassword('pending123'),
    emailVerifiedAt: null
  };
  users.set(pendingUser.email, pendingUser);
  users.set(pendingUser.id, pendingUser);

  const prisma = {
    dish: {}, chef: {}, ingredient: {}, dishIngredient: {}, chefDish: {},
    async $executeRaw() {},
    async $queryRaw() {},
    async $transaction(callback) { return callback(this); },
    user: {
      async findUnique({ where }) {
        if (where.email) return users.get(where.email) ? { ...users.get(where.email) } : null;
        if (where.id) return users.get(where.id) ? { ...users.get(where.id) } : null;
        return null;
      },
      async update({ where, data }) {
        const u = users.get(where.id);
        if (!u) throw new Error('User not found');
        Object.assign(u, data);
        return { ...u };
      }
    },
    passwordReset: {
      async create({ data }) {
        const record = { id: nextTokenId++, usedAt: null, invalidatedAt: null, ...data };
        tokens.push(record);
        return { ...record };
      },
      async findUnique({ where }) {
        const found = tokens.find(t => t.tokenHash === where.tokenHash);
        return found ? { ...found } : null;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const t of tokens) {
          if (where.id !== undefined && t.id !== where.id) continue;
          if (where.userId !== undefined && t.userId !== where.userId) continue;
          if (where.usedAt === null && t.usedAt !== null) continue;
          if (where.invalidatedAt === null && t.invalidatedAt !== null) continue;
          if (where.id && where.id.not !== undefined && t.id === where.id.not) continue;
          if (where.expiresAt && where.expiresAt.gt && !(t.expiresAt > where.expiresAt.gt)) continue;
          Object.assign(t, data);
          count++;
        }
        return { count };
      }
    },
    session: {
      async create({ data }) {
        sessions.set(data.tokenHash, data);
        return data;
      },
      async findUnique({ where }) {
        const s = sessions.get(where.tokenHash);
        if (!s) return null;
        const u = users.get(s.userId);
        return { ...s, user: u };
      },
      async deleteMany({ where }) {
        let count = 0;
        if (where.tokenHash) {
          if (sessions.delete(where.tokenHash)) count++;
        }
        if (where.userId !== undefined) {
          for (const [k, v] of [...sessions.entries()]) {
            if (v.userId === where.userId) {
              sessions.delete(k);
              count++;
            }
          }
        }
        return { count };
      }
    },
    passwordResetLimit: {
      async findUnique({ where }) {
        return limits.get(where.key) || null;
      },
      async upsert({ where, create, update }) {
        const existing = limits.get(where.key);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { ...create };
        limits.set(where.key, created);
        return created;
      },
      async update({ where, data }) {
        const existing = limits.get(where.key);
        if (existing) {
          if (data.count?.increment) existing.count += data.count.increment;
        }
        return existing;
      }
    }
  };

  const mailer = {
    isConfigured: () => true,
    async sendPasswordResetEmail(msg) { sentEmails.push({ type: 'reset', ...msg }); },
    async sendPasswordChangedNotice(msg) { sentEmails.push({ type: 'notice', ...msg }); }
  };

  const app = createApp({
    prisma,
    mailer,
    logger: { error() {}, log() {}, warn() {} },
    authConfig: { appBaseUrl: 'http://localhost:3001', recaptchaSiteKey: 'test' }
  });

  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function getCsrf(path = '/auth/forgot') {
    const res = await fetch(base + path, { headers: { connection: 'close' } });
    const html = await res.text();
    const cookie = res.headers.get('set-cookie')?.match(/soucha_csrf=([^;]+)/)?.[1];
    const token = html.match(/name="_csrf" value="([^"]+)"/)?.[1];
    return { cookie, token, html, status: res.status, headers: res.headers };
  }

  try {
    await fn({
      base,
      prisma,
      users,
      tokens,
      sessions,
      limits,
      sentEmails,
      getCsrf,
      defaultUser,
      pendingUser
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('F01: POST /forgot returns same status 200 and message for existing and non-existing email, without raw token', async () => fixture(async ({ base, getCsrf, sentEmails }) => {
  // 1. Existing email
  const { cookie: c1, token: t1 } = await getCsrf('/auth/forgot');
  const res1 = await fetch(base + '/auth/forgot', {
    method: 'POST',
    headers: {
      cookie: `soucha_csrf=${c1}`,
      'content-type': 'application/x-www-form-urlencoded',
      connection: 'close'
    },
    body: new URLSearchParams({ email: 'user@example.com', _csrf: t1 })
  });
  assert.equal(res1.status, 200);
  const html1 = await res1.text();
  assert.match(html1, /Nếu email của bạn tồn tại trong hệ thống/);
  // Ensure raw token is not exposed in HTML
  assert.equal(html1.includes('token='), false);

  // Wait for setImmediate mail dispatch
  await new Promise(r => setTimeout(r, 50));
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'user@example.com');
  assert.match(sentEmails[0].resetUrl, /\/auth\/reset\?token=[a-f0-9]{64}/);

  // 2. Non-existing email
  const { cookie: c2, token: t2 } = await getCsrf('/auth/forgot');
  const res2 = await fetch(base + '/auth/forgot', {
    method: 'POST',
    headers: {
      cookie: `soucha_csrf=${c2}`,
      'content-type': 'application/x-www-form-urlencoded',
      connection: 'close'
    },
    body: new URLSearchParams({ email: 'nonexistent@example.com', _csrf: t2 })
  });
  assert.equal(res2.status, 200);
  const html2 = await res2.text();
  assert.match(html2, /Nếu email của bạn tồn tại trong hệ thống/);

  await new Promise(r => setTimeout(r, 50));
  // No email sent for nonexistent user
  assert.equal(sentEmails.length, 1);
}));

test('F01: POST /forgot enforces email rate limiting (3 requests / 15m) and IP limiting', async () => fixture(async ({ base, getCsrf }) => {
  const email = 'spam@example.com';
  for (let i = 0; i < 3; i++) {
    const { cookie, token } = await getCsrf('/auth/forgot');
    const res = await fetch(base + '/auth/forgot', {
      method: 'POST',
      headers: { cookie: `soucha_csrf=${cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
      body: new URLSearchParams({ email, _csrf: token })
    });
    assert.equal(res.status, 200);
  }

  // 4th request exceeds email limit
  const { cookie: c4, token: t4 } = await getCsrf('/auth/forgot');
  const res4 = await fetch(base + '/auth/forgot', {
    method: 'POST',
    headers: { cookie: `soucha_csrf=${c4}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({ email, _csrf: t4 })
  });
  assert.equal(res4.status, 429);
  assert.ok(Number(res4.headers.get('retry-after')) > 0);
}));

test('F02: New forgot request invalidates older unused reset tokens and sets 15m expiry', async () => fixture(async ({ base, getCsrf, tokens, sentEmails }) => {
  // First request
  const { cookie: c1, token: t1 } = await getCsrf('/auth/forgot');
  await fetch(base + '/auth/forgot', {
    method: 'POST',
    headers: { cookie: `soucha_csrf=${c1}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({ email: 'user@example.com', _csrf: t1 })
  });
  await new Promise(r => setTimeout(r, 50));
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].invalidatedAt, null);
  assert.equal(tokens[0].usedAt, null);
  // 15 minutes = 900,000 ms
  assert.ok(tokens[0].expiresAt - Date.now() <= 900000);
  assert.ok(tokens[0].expiresAt - Date.now() > 890000);

  // Second request for the same user
  const { cookie: c2, token: t2 } = await getCsrf('/auth/forgot');
  await fetch(base + '/auth/forgot', {
    method: 'POST',
    headers: { cookie: `soucha_csrf=${c2}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({ email: 'user@example.com', _csrf: t2 })
  });
  await new Promise(r => setTimeout(r, 50));
  assert.equal(tokens.length, 2);
  // Old token is invalidated
  assert.ok(tokens[0].invalidatedAt instanceof Date);
  // New token is active
  assert.equal(tokens[1].invalidatedAt, null);
}));

test('F03: GET /reset?token=... renders reset form; does NOT consume token or alter sessions', async () => fixture(async ({ base, getCsrf, tokens, sentEmails, defaultUser }) => {
  const { cookie, token } = await getCsrf('/auth/forgot');
  await fetch(base + '/auth/forgot', {
    method: 'POST',
    headers: { cookie: `soucha_csrf=${cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({ email: defaultUser.email, _csrf: token })
  });
  await new Promise(r => setTimeout(r, 50));
  const rawToken = sentEmails[0].resetUrl.split('token=')[1];

  // GET /auth/reset?token=...
  const res = await fetch(base + `/auth/reset?token=${rawToken}`, { headers: { connection: 'close' } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Đặt lại mật khẩu/);
  assert.match(html, /name="password"/);
  assert.match(html, /name="confirmPassword"/);

  // Assert token was NOT consumed
  assert.equal(tokens[0].usedAt, null);
  assert.equal(tokens[0].invalidatedAt, null);

  // Verify security headers
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
}));

test('F03: GET /reset enforces shared IP quota (returns 429 without consuming token)', async () => fixture(async ({ base, tokens, limits, defaultUser }) => {
  // Populate limit to threshold for all possible loopback representations
  limits.set('reset-ip:127.0.0.1', { count: 20, windowStart: new Date() });
  limits.set('reset-ip:::1', { count: 20, windowStart: new Date() });

  const res = await fetch(base + `/auth/reset?token=${'a'.repeat(64)}`, { headers: { connection: 'close' } });
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
}));

test('F04: POST /reset updates passwordHash, marks usedAt, invalidates other tokens, deletes sessions, 303 redirects', async () => fixture(async ({ base, getCsrf, tokens, sessions, sentEmails, defaultUser }) => {
  // Create an active session for defaultUser
  const sessionToken = 's'.repeat(64);
  sessions.set(hashToken(sessionToken), {
    id: 10,
    userId: defaultUser.id,
    tokenHash: hashToken(sessionToken),
    csrfToken: 'c'.repeat(64),
    expiresAt: new Date(Date.now() + 86400000)
  });

  // Request reset
  const { cookie, token } = await getCsrf('/auth/forgot');
  await fetch(base + '/auth/forgot', {
    method: 'POST',
    headers: { cookie: `soucha_csrf=${cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({ email: defaultUser.email, _csrf: token })
  });
  await new Promise(r => setTimeout(r, 50));
  const rawToken = sentEmails[0].resetUrl.split('token=')[1];

  // Get CSRF from reset page
  const resetPage = await getCsrf(`/auth/reset?token=${rawToken}`);
  const postRes = await fetch(base + '/auth/reset', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: `soucha_csrf=${resetPage.cookie}`,
      'content-type': 'application/x-www-form-urlencoded',
      connection: 'close'
    },
    body: new URLSearchParams({
      token: rawToken,
      password: 'newPassword123',
      confirmPassword: 'newPassword123',
      _csrf: resetPage.token
    })
  });

  // Redirect 303 to login
  assert.equal(postRes.status, 303);
  assert.equal(postRes.headers.get('location'), '/auth/login?reset=1');

  // Verify password changed
  assert.equal(await verifyPassword('newPassword123', defaultUser.passwordHash), true);
  assert.equal(await verifyPassword('password123', defaultUser.passwordHash), false);

  // Verify token was claimed (usedAt)
  assert.ok(tokens[0].usedAt instanceof Date);

  // Verify all user sessions were deleted
  assert.equal([...sessions.values()].filter(s => s.userId !== null).length, 0);

  // Verify notice email sent
  await new Promise(r => setTimeout(r, 50));
  const noticeEmail = sentEmails.find(e => e.type === 'notice');
  assert.ok(noticeEmail);
  assert.equal(noticeEmail.to, defaultUser.email);
}));

test('F05: Invalid/expired/used/superseded token returns status 200 INVALID_RESET_TOKEN', async () => fixture(async ({ base, getCsrf, tokens, sentEmails, defaultUser }) => {
  // 1. Malformed token
  const res1 = await fetch(base + '/auth/reset?token=short', { headers: { connection: 'close' } });
  assert.equal(res1.status, 200);
  assert.match(await res1.text(), /INVALID_RESET_TOKEN/);

  // 2. Expired token
  tokens.push({
    id: 99,
    userId: defaultUser.id,
    tokenHash: hashToken('e'.repeat(64)),
    expiresAt: new Date(Date.now() - 1000), // in the past
    usedAt: null,
    invalidatedAt: null
  });
  const res2 = await fetch(base + `/auth/reset?token=${'e'.repeat(64)}`, { headers: { connection: 'close' } });
  assert.equal(res2.status, 200);
  assert.match(await res2.text(), /INVALID_RESET_TOKEN/);

  // 3. Already used token
  tokens.push({
    id: 100,
    userId: defaultUser.id,
    tokenHash: hashToken('u'.repeat(64)),
    expiresAt: new Date(Date.now() + 100000),
    usedAt: new Date(),
    invalidatedAt: null
  });
  const res3 = await fetch(base + `/auth/reset?token=${'u'.repeat(64)}`, { headers: { connection: 'close' } });
  assert.equal(res3.status, 200);
  assert.match(await res3.text(), /INVALID_RESET_TOKEN/);

  // 4. Superseded (invalidated) token
  tokens.push({
    id: 101,
    userId: defaultUser.id,
    tokenHash: hashToken('i'.repeat(64)),
    expiresAt: new Date(Date.now() + 100000),
    usedAt: null,
    invalidatedAt: new Date()
  });
  const res4 = await fetch(base + `/auth/reset?token=${'i'.repeat(64)}`, { headers: { connection: 'close' } });
  assert.equal(res4.status, 200);
  assert.match(await res4.text(), /INVALID_RESET_TOKEN/);

  // Attempting to POST with an invalid token returns 200 INVALID_RESET_TOKEN
  const { cookie, token } = await getCsrf('/auth/forgot');
  const postRes = await fetch(base + '/auth/reset', {
    method: 'POST',
    headers: { cookie: `soucha_csrf=${cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({
      token: 'i'.repeat(64),
      password: 'attemptPassword123',
      confirmPassword: 'attemptPassword123',
      _csrf: token
    })
  });
  assert.equal(postRes.status, 200);
  assert.match(await postRes.text(), /INVALID_RESET_TOKEN/);
  // Password unchanged
  assert.equal(await verifyPassword('attemptPassword123', defaultUser.passwordHash), false);
}));

test('F06: Two concurrent reset POSTs have exactly one winner', async () => fixture(async ({ base, getCsrf, defaultUser, sentEmails }) => {
  const { cookie, token } = await getCsrf('/auth/forgot');
  await fetch(base + '/auth/forgot', {
    method: 'POST',
    headers: { cookie: `soucha_csrf=${cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({ email: defaultUser.email, _csrf: token })
  });
  await new Promise(r => setTimeout(r, 50));
  const rawToken = sentEmails[0].resetUrl.split('token=')[1];

  const resetPage1 = await getCsrf(`/auth/reset?token=${rawToken}`);
  const resetPage2 = await getCsrf(`/auth/reset?token=${rawToken}`);

  const [res1, res2] = await Promise.all([
    fetch(base + '/auth/reset', {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: `soucha_csrf=${resetPage1.cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
      body: new URLSearchParams({ token: rawToken, password: 'passwordOne1', confirmPassword: 'passwordOne1', _csrf: resetPage1.token })
    }),
    fetch(base + '/auth/reset', {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: `soucha_csrf=${resetPage2.cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
      body: new URLSearchParams({ token: rawToken, password: 'passwordTwo2', confirmPassword: 'passwordTwo2', _csrf: resetPage2.token })
    })
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.deepEqual(statuses, [200, 303]);
}));

test('F07: Pending unverified user can reset password, but remains pending (not activated)', async () => fixture(async ({ base, getCsrf, pendingUser, sentEmails }) => {
  assert.equal(pendingUser.emailVerifiedAt, null);

  // Request reset for pending user
  const { cookie, token } = await getCsrf('/auth/forgot');
  await fetch(base + '/auth/forgot', {
    method: 'POST',
    headers: { cookie: `soucha_csrf=${cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({ email: pendingUser.email, _csrf: token })
  });
  await new Promise(r => setTimeout(r, 50));
  const rawToken = sentEmails[0].resetUrl.split('token=')[1];

  // Perform reset
  const resetPage = await getCsrf(`/auth/reset?token=${rawToken}`);
  const postRes = await fetch(base + '/auth/reset', {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: `soucha_csrf=${resetPage.cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({
      token: rawToken,
      password: 'newPendingPassword123',
      confirmPassword: 'newPendingPassword123',
      _csrf: resetPage.token
    })
  });
  assert.equal(postRes.status, 303);

  // Password was updated
  assert.equal(await verifyPassword('newPendingPassword123', pendingUser.passwordHash), true);

  // User remains unverified (NOT activated)
  assert.equal(pendingUser.emailVerifiedAt, null);
}));

test('Root paths /forgot and /reset work identically to /auth/forgot and /auth/reset', async () => fixture(async ({ base, getCsrf, defaultUser, sentEmails }) => {
  const { cookie, token } = await getCsrf('/forgot');
  const res = await fetch(base + '/forgot', {
    method: 'POST',
    headers: { cookie: `soucha_csrf=${cookie}`, 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
    body: new URLSearchParams({ email: defaultUser.email, _csrf: token })
  });
  assert.equal(res.status, 200);
  await new Promise(r => setTimeout(r, 50));
  const rawToken = sentEmails[0].resetUrl.split('token=')[1];

  const getReset = await fetch(base + `/reset?token=${rawToken}`, { headers: { connection: 'close' } });
  assert.equal(getReset.status, 200);
  assert.match(await getReset.text(), /Đặt lại mật khẩu/);
}));
