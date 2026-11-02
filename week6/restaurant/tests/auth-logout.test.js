const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash, timingSafeEqual } = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { createLogoutRouter, createLogoutRecaptchaFromEnv } = require('../src/auth/logout');
const { createRecaptchaV2Verifier } = require('../src/auth/recaptcha-v2');

// Explicit integration fixtures for the teammate's session contract. These are
// not a production login/session implementation or real PostgreSQL evidence.
async function withLogout(callback, options = {}) {
  const sidA = 'a'.repeat(64), sidB = 'b'.repeat(64);
  const digest = (sid) => createHash('sha256').update(sid).digest('hex');
  const csrf = 'c'.repeat(64);
  const user = { id: 7, email: 'student@example.com', status: 'active', emailVerifiedAt: new Date() };
  const rows = new Map([sidA, sidB].map((sid) => [digest(sid), {
    sidHash: digest(sid), userId: user.id, csrfToken: csrf, expiresAt: new Date(Date.now() + 60000)
  }]));
  const events = [], usedProofs = new Set();
  let providerCalls = 0, businessCalls = 0, origin = '';
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const sid = /(?:^|;\s*)sid=([0-9a-f]{64})(?:;|$)/.exec(req.get('cookie') || '')?.[1];
    const session = sid && rows.get(digest(sid));
    req.auth = { user: session ? user : null, session: session || null };
    res.locals.csrfToken = session?.csrfToken || '';
    next();
  });
  const requireLogin = (req, res, next) => {
    if (!req.auth.user || user.status !== 'active' || !user.emailVerifiedAt
      || req.auth.session.expiresAt <= new Date()) return res.redirect(303, '/login');
    next();
  };
  const requireCsrf = (req, res, next) => {
    const supplied = req.body._csrf;
    const source = req.get('origin') || req.get('referer');
    let sameOrigin = true;
    try { if (source) sameOrigin = new URL(source).origin === origin; } catch { sameOrigin = false; }
    if (typeof supplied !== 'string' || !/^[0-9a-f]{64}$/.test(supplied)
      || !timingSafeEqual(Buffer.from(supplied), Buffer.from(req.auth.session.csrfToken)) || !sameOrigin) {
      return res.status(403).send('CSRF rejected');
    }
    next();
  };
  const prisma = { session: { async deleteMany({ where }) {
    events.push('delete-start');
    if (options.onDelete) await options.onDelete();
    let count = 0;
    for (const [key, row] of rows) {
      if (key === where.sidHash && row.userId === where.userId) { rows.delete(key); count++; }
    }
    events.push('delete-complete');
    return { count };
  } } };
  const recaptchaVerifier = createRecaptchaV2Verifier({
    siteKey: 'public-v2-site', secretKey: options.unconfigured ? '' : 'private-v2-secret',
    expectedHostname: 'localhost',
    fetchImpl: async (_url, request) => {
      providerCalls++;
      if (options.providerFailure) throw new Error('provider failure with private-v2-secret');
      const proof = request.body.get('response');
      const success = proof.startsWith('valid-') && !usedProofs.has(proof);
      usedProofs.add(proof);
      return { ok: true, async json() { return {
        success, hostname: 'localhost', challenge_ts: new Date().toISOString(),
        'error-codes': success ? [] : ['timeout-or-duplicate']
      }; } };
    }
  });
  app.use(createLogoutRouter({
    prisma, requireLogin, requireCsrf, recaptchaVerifier, authConfig: { sessionCookieName: 'sid' },
    clearSessionCookie(res, config) {
      events.push('clear-cookie');
      res.append('Set-Cookie', `${config.sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    }
  }));
  app.use(['/dishes', '/admin'], requireLogin, (_req, res) => { businessCalls++; res.send('private restaurant data'); });
  app.use((_req, res) => res.sendStatus(404));
  app.use((_error, _req, res, _next) => res.status(500).send('Technical error'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url, { sid = sidA, data, headers = {}, ...rest } = {}) => fetch(origin + url, {
    redirect: 'manual', ...rest,
    ...(data ? { method: 'POST', body: new URLSearchParams(data) } : {}),
    headers: { ...(sid ? { cookie: `sid=${sid}` } : {}), ...headers }
  });
  try {
    await callback({ request, sidA, sidB, csrf, user, rows, events, digest,
      calls: () => ({ providerCalls, businessCalls }) });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('confirmation form uses v2 Checkbox, escaped account and shared CSRF without logging out', async () => {
  await withLogout(async ({ request, rows, user, csrf, calls }) => {
    user.email = '<script>not-an-email</script>';
    const response = await request('/logout/confirm');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /action="\/logout"/);
    assert.match(html, /name="_csrf"/);
    assert.ok(html.includes(csrf));
    assert.match(html, /class="g-recaptcha" data-sitekey="public-v2-site"/);
    assert.match(html, /https:\/\/www.google.com\/recaptcha\/api.js\?hl=vi/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /private-v2-secret/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(rows.size, 2);
    assert.equal(calls().providerCalls, 0);
  });
});

test('valid POST deletes only A before expiring cookie and redirects; captured A loses access, B stays', async () => {
  await withLogout(async ({ request, sidA, sidB, csrf, rows, digest, events, calls }) => {
    assert.equal((await request('/dishes')).status, 200);
    const response = await request('/logout', { data: { _csrf: csrf, 'g-recaptcha-response': 'valid-A' } });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/login');
    assert.match(response.headers.get('set-cookie'), /sid=;.*Max-Age=0/);
    assert.deepEqual(events, ['delete-start', 'delete-complete', 'clear-cookie']);
    assert.equal(rows.has(digest(sidA)), false);
    assert.equal(rows.has(digest(sidB)), true);
    const before = calls().businessCalls;
    for (const url of ['/dishes', '/dishes/1', '/admin/dishes', '/admin/chefs/1']) {
      const replay = await request(url, { sid: sidA });
      assert.equal(replay.status, 303);
      assert.equal(replay.headers.get('location'), '/login');
    }
    const write = await request('/admin/dishes', { sid: sidA, data: { name: 'cannot create' } });
    assert.equal(write.status, 303);
    assert.equal(calls().businessCalls, before);
    assert.equal((await request('/dishes', { sid: sidB })).status, 200);
  });
});

test('GET logout never revokes; anonymous, expired and pending sessions cannot trigger CAPTCHA or deletion', async () => {
  await withLogout(async ({ request, rows, user, csrf, calls }) => {
    assert.equal((await request('/logout')).status, 404);
    assert.equal(rows.size, 2);
    assert.equal((await request('/logout/confirm', { sid: null })).status, 303);
    assert.equal((await request('/logout', { sid: null, data: { _csrf: csrf } })).status, 303);
    user.status = 'pending';
    assert.equal((await request('/logout', { data: { _csrf: csrf } })).status, 303);
    user.status = 'active';
    for (const row of rows.values()) row.expiresAt = new Date(0);
    assert.equal((await request('/logout', { data: { _csrf: csrf } })).status, 303);
    assert.equal(calls().providerCalls, 0);
    assert.equal(rows.size, 2);
  });
});

test('missing/wrong CSRF or foreign origin stops before CAPTCHA and preserves the session', async () => {
  await withLogout(async ({ request, csrf, rows, calls }) => {
    for (const [token, headers] of [[undefined, {}], ['wrong', {}], [csrf, { origin: 'https://evil.example' }],
      [csrf, { referer: 'https://evil.example/form' }]]) {
      const response = await request('/logout', { headers, data: { _csrf: token, 'g-recaptcha-response': 'valid-A' } });
      assert.equal(response.status, 403);
    }
    assert.equal(rows.size, 2);
    assert.equal(calls().providerCalls, 0);
  });
});

test('missing/invalid CAPTCHA cannot be bypassed by captchaPassed; used proof cannot log B out', async () => {
  await withLogout(async ({ request, csrf, rows, sidB }) => {
    for (const proof of ['', 'invalid-proof']) {
      const response = await request('/logout', { data: { _csrf: csrf, 'g-recaptcha-response': proof, captchaPassed: 'true' } });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Vui lòng xác nhận reCAPTCHA/);
      assert.equal(rows.size, 2);
    }
    await request('/logout', { data: { _csrf: csrf, 'g-recaptcha-response': 'valid-once' } });
    const replay = await request('/logout', { sid: sidB, data: { _csrf: csrf, 'g-recaptcha-response': 'valid-once' } });
    assert.equal(replay.status, 200);
    assert.equal(rows.size, 1);
    assert.equal((await request('/dishes', { sid: sidB })).status, 200);
  });
});

test('provider outage or missing setup returns technical error without destroying the session', async () => {
  for (const options of [{ providerFailure: true }, { unconfigured: true }]) {
    await withLogout(async ({ request, csrf, rows, events }) => {
      const response = await request('/logout', { data: { _csrf: csrf, 'g-recaptcha-response': 'valid-A' } });
      assert.equal(response.status, 500);
      assert.equal(response.headers.get('location'), null);
      assert.doesNotMatch(await response.text(), /private-v2-secret/);
      assert.deepEqual(events, []);
      assert.equal(rows.size, 2);
    }, options);
  }
});

test('store rejection cannot be presented as a successful logout', async () => {
  await withLogout(async ({ request, csrf, rows, events }) => {
    const response = await request('/logout', { data: { _csrf: csrf, 'g-recaptcha-response': 'valid-A' } });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(events, ['delete-start']);
    assert.equal(rows.size, 2);
    assert.equal((await request('/dishes')).status, 200);
  }, { onDelete: async () => { throw new Error('database offline'); } });
});

test('response waits until session deletion resolves', async () => {
  let release, entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  await withLogout(async ({ request, csrf, events }) => {
    let completed = false;
    const pending = request('/logout', { data: { _csrf: csrf, 'g-recaptcha-response': 'valid-A' } })
      .then((response) => { completed = true; return response; });
    try {
      await started;
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(completed, false);
      assert.deepEqual(events, ['delete-start']);
    } finally { release(); }
    assert.equal((await pending).status, 303);
  }, { onDelete: async () => { entered(); await gate; } });
});

test('factory rejects missing shared foundation and production rejects untrusted origin configuration', () => {
  assert.throws(() => createLogoutRouter(), /persistent session store/);
  for (const env of [{ NODE_ENV: 'production' },
    { NODE_ENV: 'production', APP_BASE_URL: 'http://localhost:3001' },
    { APP_BASE_URL: 'https://example.com/extra' }, { APP_BASE_URL: 'https://user:pass@example.com' }]) {
    assert.throws(() => createLogoutRecaptchaFromEnv(env), /APP_BASE_URL/);
  }
  const provider = createLogoutRecaptchaFromEnv({ APP_BASE_URL: 'http://localhost:3001' });
  assert.equal(provider.isConfigured(), false);
});
