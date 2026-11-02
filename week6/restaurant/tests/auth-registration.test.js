const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { verifyPassword } = require('../src/auth/session');

test('registration requires CAPTCHA, sends a single-use verification link, and replaces pending credentials', async () => {
  let user = null, nextTokenId = 0; const tokens = []; let link;
  const prisma = {
    dish: {}, chef: {}, ingredient: {}, dishIngredient: {}, chefDish: {},
    async $executeRaw() {}, async $queryRaw() {}, async $transaction(fn) { return fn(this); },
    user: {
      async findUnique({ where }) { return user && (where.email === user.email || where.id === user.id) ? { ...user } : null; },
      async create({ data }) { user = { id: 1, ...data, emailVerifiedAt: null }; return { ...user }; },
      async update({ data }) { Object.assign(user, data); return { ...user }; },
      async updateMany({ data }) { if (!user.emailVerifiedAt) Object.assign(user, data); return { count: 1 }; }
    },
    emailVerificationToken: {
      async create({ data }) { const token = { id: ++nextTokenId, usedAt: null, ...data }; tokens.push(token); return token; },
      async findUnique({ where }) { return tokens.find(t => t.tokenHash === where.tokenHash) || null; },
      async updateMany({ where, data }) { let count = 0; for (const token of tokens) { if (where.id !== undefined && token.id !== where.id) continue; if (where.userId !== undefined && token.userId !== where.userId) continue; if (where.usedAt === null && token.usedAt !== null) continue; if (where.expiresAt && !(token.expiresAt > where.expiresAt.gt)) continue; Object.assign(token, data); count++; } return { count }; }
    }
  };
  const mailer = { isConfigured: () => true, async sendVerificationEmail(message) { link = message.verifyUrl; } };
  const recaptchaVerifier = { async verifyToken(token) { return token === 'ok' ? { ok: true } : { ok: false, reason: 'verification-failed' }; } };
  const server = createApp({ prisma, mailer, recaptchaVerifier, logger: { error() {} }, authConfig: { appBaseUrl: 'http://localhost:3001', recaptchaSiteKey: 'test' } }).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function register(password, captcha = 'ok') { const page = await fetch(base + '/auth/register'), html = await page.text(), csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)[1], cookie = page.headers.get('set-cookie').match(/soucha_csrf=([a-f0-9]+)/)[1]; return fetch(base + '/auth/register', { method: 'POST', headers: { cookie: `soucha_csrf=${cookie}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: ' Test@Example.com ', password, confirmPassword: password, _csrf: csrf, 'g-recaptcha-response': captcha }) }); }
  try {
    assert.equal((await register('password1', 'bad')).status, 400); assert.equal(user, null);
    assert.equal((await register('password1')).status, 200); assert.equal(user.email, 'test@example.com');
    const old = new URL(link).pathname + new URL(link).search;
    assert.equal((await register('password2')).status, 200); const newer = new URL(link).pathname + new URL(link).search;
    assert.equal(await verifyPassword('password2', user.passwordHash), true);
    assert.equal((await fetch(base + old)).status, 400);
    assert.equal((await fetch(base + newer)).status, 200); assert.ok(user.emailVerifiedAt);
    assert.equal((await fetch(base + newer)).status, 400);
    assert.equal((await register('password3')).status, 400);
    assert.equal(await verifyPassword('password2', user.passwordHash), true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
