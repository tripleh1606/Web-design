const { test } = require('node:test');
const assert = require('node:assert/strict');
const { disposableSqlite } = require('./helpers/sqlite');
const { registrationFixture } = require('./helpers/registration-fixture');
const { hashToken, verifyPassword } = require('../src/auth/session');
const { createSmtpMailer } = require('../src/auth/mail');
const { SMTPServer } = require('smtp-server');
const { lockDatabaseWrite } = require('../src/auth/database-lock');
const path = require('node:path');

test('registration: real SQLite transaction/concurrency and SMTP integration', { timeout: 120000 }, async t => {
  const { prisma, createClient } = await disposableSqlite(t);
  async function fresh(t, options = {}) {
    // Database is created by this test, never read from DATABASE_URL or a shared service.
    await prisma.user.deleteMany(); await prisma.activationAttempt.deleteMany();
    await prisma.rateLimitBucket.deleteMany(); await prisma.session.deleteMany();
    await prisma.loginAttempt.deleteMany(); await prisma.loginIpLimit.deleteMany();
    return registrationFixture(t, { prisma, ...options });
  }
  await t.test('SQLite migration preserves legacy users, sessions and restaurant data', async t => {
    const db = await disposableSqlite(t, { schema: path.join(__dirname, 'helpers/legacy-auth.prisma') });
    await db.prisma.$executeRawUnsafe(`INSERT INTO users (email, "passwordHash", "emailVerifiedAt", "updatedAt") VALUES
      ('pending@example.com', 'unchanged-pending-hash', NULL, CURRENT_TIMESTAMP),
      ('active@example.com', 'unchanged-active-hash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
    await db.prisma.$executeRawUnsafe(`INSERT INTO sessions ("tokenHash", "csrfToken", "userId", "expiresAt") VALUES ('preserved-token', 'preserved-csrf', 2, '2030-01-01 00:00:00')`);
    await db.prisma.dish.create({ data: { name: 'Preserved dish', price: 45000 } });
    await db.executeSql(path.join(__dirname, '../prisma/registration-upgrade.sql'));
    const users = await db.prisma.user.findMany({ orderBy: { id: 'asc' } });
    assert.deepEqual(users.map(user => user.status), ['pending', 'active']);
    assert.deepEqual(users.map(user => user.passwordHash), ['unchanged-pending-hash', 'unchanged-active-hash']);
    assert.ok(users.every(user => user.emailOriginal === user.email && user.role === 'viewer'));
    assert.equal((await db.prisma.session.findFirst()).tokenHash, 'preserved-token');
    assert.equal((await db.prisma.session.findFirst()).userId, 2);
    await db.prisma.session.create({ data: { tokenHash: 'anonymous', csrfToken: 'csrf', userId: null, expiresAt: new Date() } });
    assert.equal((await db.prisma.dish.findFirst()).name, 'Preserved dish');
    await db.pushSchema(); // Migration matches the Prisma schema without destructive reconciliation.
    assert.equal(await db.prisma.session.count(), 2);
    await db.prisma.user.delete({ where: { id: 2 } });
    assert.equal(await db.prisma.session.count(), 1); // FK cascade survived table rebuild.
  });
  await t.test('SQLite week5 schema upgrades without losing dishes, recipes or chef assignments', async t => {
    const db = await disposableSqlite(t, { schema: path.resolve(__dirname, '../../../week5/api/prisma/schema.sqlite.prisma') });
    const dish = await db.prisma.dish.create({ data: { name: 'Week5 Matcha', price: 45000 } });
    const chef = await db.prisma.chef.create({ data: { name: 'Chef', specialty: 'Tea' } });
    const ingredient = await db.prisma.ingredient.create({ data: { name: 'Matcha', unit: 'g', stock: 100 } });
    await db.prisma.dishIngredient.create({ data: { dishId: dish.id, ingredientId: ingredient.id, amount: 5 } });
    await db.prisma.chefDish.create({ data: { dishId: dish.id, chefId: chef.id } });
    await db.pushSchema();
    const preserved = await db.prisma.dish.findUnique({ where: { id: dish.id }, include: { ingredients: true, chefs: true } });
    assert.equal(preserved.name, dish.name); assert.equal(preserved.price, dish.price);
    assert.equal(preserved.ingredients[0].amount, 5); assert.equal(preserved.chefs[0].chefId, chef.id);
    assert.equal((await db.prisma.ingredient.findFirst()).stock, 100);
    const f = await registrationFixture(t, { prisma: db.prisma });
    assert.equal((await f.register()).status, 200);
    const message = await f.mail();
    assert.match((await f.post('/activate', { email: 'Person@example.com', otp: message.otp })).html, /Kích hoạt thành công/);
    const login = await f.post('/login', { email: 'Person@example.com', password: 'original-password', 'g-recaptcha-response': 'captcha-login' });
    const cookie = login.headers.get('set-cookie').match(/soucha_session=[^;]+/)[0];
    const menu = await f.get('/dishes?q=matcha', { cookie });
    assert.equal(menu.status, 200); assert.match(menu.html, /Week5 Matcha/);
  });
  await t.test('DB R01/R02/R04: stored hashes, preserved pending credentials, concurrent correct OTP has one winner', async t => {
    const f = await fresh(t); await f.register(); const message = await f.mail();
    const user = await prisma.user.findUnique({ where: { email: 'Person@example.com' } });
    assert.equal(user.role, 'viewer'); assert.equal(user.status, 'pending');
    assert.equal((await f.post('/login', { email: user.email, password: 'original-password', 'g-recaptcha-response': 'captcha-pending-login' })).status, 403);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    f.advance(61000);
    await f.register('Person@EXAMPLE.com', { password: 'attacker-password', confirmPassword: 'attacker-password' });
    const newest = await f.mail(2);
    assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).passwordHash, user.passwordHash);
    assert.equal(await verifyPassword('original-password', user.passwordHash), true);
    const parallelApp = await registrationFixture(t, { prisma: createClient() });
    const outcomes = await Promise.all([f.post('/activate', { email: user.email, otp: newest.otp }), parallelApp.post('/activate', { email: user.email, otp: newest.otp })]);
    assert.equal(outcomes.filter(r => /Kích hoạt thành công/.test(r.html)).length, 1);
    assert.equal(outcomes.filter(r => /INVALID_OTP/.test(r.html)).length, 1);
    const active = await prisma.user.findUnique({ where: { id: user.id } });
    const challenge = await prisma.activationChallenge.findUnique({ where: { userId: user.id } });
    assert.equal(active.status, 'active'); assert.deepEqual(active.emailVerifiedAt, challenge.usedAt);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    assert.equal(JSON.stringify(challenge).includes(message.otp), false);
    assert.equal((await f.post('/login', { email: user.email, password: 'attacker-password', 'g-recaptcha-response': 'captcha-wrong-password' })).status, 401);
    const login = await f.post('/login', { email: user.email, password: 'original-password', 'g-recaptcha-response': 'captcha-active-login' });
    assert.equal(login.status, 303); assert.match(login.headers.get('set-cookie'), /soucha_session=/);
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
  });
  await t.test('DB: concurrent registrations converge without duplicate users or credential replacement', async t => {
    const f = await fresh(t);
    const results = await Promise.all([f.register(), f.register()]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
    assert.equal(await prisma.user.count(), 1); assert.equal(await prisma.activationChallenge.count(), 1);
    await f.mail(); assert.equal(f.sent.length, 1);
  });
  await t.test('DB R05: concurrent invalid OTP requests do not lose increments; resend/register cannot bypass lock', async t => {
    const f = await fresh(t); await f.register(); await f.mail();
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => f.post('/activate', { email: ' Person@EXAMPLE.COM ', otp: 'invalid' })));
    assert.equal(outcomes.filter(r => r.status === 429).length, 1);
    const attempt = await prisma.activationAttempt.findUnique({ where: { emailKey: hashToken('Person@example.com') } });
    const challenge = await prisma.activationChallenge.findFirst();
    assert.equal(attempt.attempts, 5); assert.equal(challenge.attempts, 5); assert.deepEqual(challenge.lockedUntil, attempt.lockedUntil);
    f.advance(61000);
    const blocked = await Promise.all([f.register(), f.post('/activate/resend', { email: 'Person@example.com' })]);
    assert.ok(blocked.every(r => r.status === 429));
    assert.equal((await prisma.activationChallenge.findFirst()).otpHash, challenge.otpHash);
  });
  await t.test('DB R06: activate/resend race cannot consume an obsolete generation after replacement commits', async t => {
    const f = await fresh(t); await f.register(); const old = await f.mail(); f.advance(61000);
    const results = await Promise.all([f.post('/activate/resend', { email: 'Person@example.com' }), f.post('/activate', { email: 'Person@example.com', otp: old.otp })]);
    assert.ok(results.every(r => r.status === 200));
    const user = await prisma.user.findUnique({ where: { email: 'Person@example.com' } });
    const challenge = await prisma.activationChallenge.findUnique({ where: { userId: user.id } });
    if (user.status === 'pending') {
      const newer = await f.mail(2);
      assert.match(results[1].html, /INVALID_OTP/); assert.equal(challenge.attempts, 1);
      assert.match((await f.post('/activate', { email: user.email, otp: old.otp })).html, /INVALID_OTP/);
      assert.match((await f.post('/activate', { email: user.email, otp: newer.otp })).html, /Kích hoạt thành công/);
    } else {
      // Activation acquired the SQLite writer first. Resend must leave consumed state.
      assert.match(results[1].html, /Kích hoạt thành công/); assert.ok(challenge.usedAt);
      assert.match((await f.post('/activate', { email: user.email, otp: old.otp })).html, /INVALID_OTP/);
    }
  });
  await t.test('DB R05: unknown/active/pending share per-email locks and request counters persist across app instances', async t => {
    const f = await fresh(t);
    for (const state of ['unknown', 'pending', 'active']) {
      const email = `${state}@example.com`;
      if (state !== 'unknown') {
        await f.register(email); await f.mail(state === 'pending' ? 1 : 2);
        if (state === 'active') await prisma.user.update({ where: { email }, data: { status: 'active', emailVerifiedAt: new Date() } });
      }
      for (let i = 0; i < 5; i++) assert.equal((await f.post('/activate', { email, otp: 'invalid' })).status, i === 4 ? 429 : 200);
    }
    const anotherApp = await registrationFixture(t, { prisma }); anotherApp.advance(61000);
    for (const state of ['unknown', 'pending', 'active']) {
      assert.equal((await anotherApp.post('/activate/resend', { email: `${state}@example.com` })).status, 429);
      assert.equal((await anotherApp.register(`${state}@example.com`)).status, 429);
    }
  });
  await t.test('DB: transaction failure during activation rolls back user status and usedAt together', async t => {
    const f = await fresh(t); await f.register(); const message = await f.mail();
    await prisma.$executeRawUnsafe("CREATE TRIGGER fail_activation_test BEFORE UPDATE ON users WHEN NEW.status = 'active' BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
    try {
      assert.equal((await f.post('/activate', { email: 'Person@example.com', otp: message.otp })).status, 500);
      assert.equal((await prisma.user.findFirst()).status, 'pending'); assert.equal((await prisma.activationChallenge.findFirst()).usedAt, null);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_activation_test');
    }
  });
  await t.test('DB: expiry is rechecked after another connection releases the SQLite writer', async t => {
    const f = await fresh(t); await f.register(); const message = await f.mail();
    const user = await prisma.user.findFirst();
    const other = createClient();
    const anotherApp = await registrationFixture(t, { prisma: other });
    let release, locked, attempted;
    const ready = new Promise(resolve => { locked = resolve; });
    const hold = new Promise(resolve => { release = resolve; });
    const waiting = new Promise(resolve => { attempted = resolve; });
    const transaction = other.$transaction.bind(other);
    other.$transaction = (callback, options) => {
      attempted(); // Prisma can wait for the writer at transaction BEGIN itself.
      return transaction(callback, options);
    };
    const holder = prisma.$transaction(async tx => {
      await lockDatabaseWrite(tx);
      locked(); await hold;
    }, { timeout: 15000 });
    await ready;
    const activation = anotherApp.post('/activate', { email: user.email, otp: message.otp });
    try {
      await Promise.race([waiting, new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Request did not reach writer reservation')), 3000);
        timer.unref();
      })]);
      anotherApp.advance(600001);
    } finally { release(); await holder; }
    assert.match((await activation).html, /INVALID_OTP/);
    assert.equal((await prisma.user.findFirst()).status, 'pending');
    assert.equal((await prisma.activationChallenge.findFirst()).usedAt, null);
  });
  await t.test('SMTP: real Nodemailer transport delivers OTP through a local SMTP server', async t => {
    const messages = [];
    const smtp = new SMTPServer({ disabledCommands: ['AUTH', 'STARTTLS'], logger: false,
      onData(stream, _session, callback) {
        let text = ''; stream.on('data', data => { text += data; });
        stream.once('end', () => { messages.push(text); callback(); });
      } });
    await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => smtp.close(resolve)));
    const mailer = createSmtpMailer({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.server.address().port), SMTP_FROM: 'soucha@example.com', SMTP_SECURE: 'false' });
    const f = await fresh(t, { mailer });
    const response = await f.register('inbox@example.com'); assert.equal(response.status, 200);
    for (let i = 0; i < 200 && !messages.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(messages.length, 1);
    // Nodemailer quoted-printable can wrap body lines. OTP itself remains six ASCII digits.
    const match = messages[0].match(/(?:=20|\s)(\d{6})(?:\r?\n|=)/);
    assert.ok(match, 'SMTP message contains a six-digit OTP');
    assert.equal(response.html.includes(match[1]), false);
    assert.match((await f.post('/activate', { email: 'inbox@example.com', otp: match[1] })).html, /Kích hoạt thành công/);
  });
});
