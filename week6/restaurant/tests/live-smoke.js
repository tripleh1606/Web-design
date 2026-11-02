// Never load the app .env here: tests must explicitly select a disposable DB.
if (process.env.AUTH_SMOKE_CHILD !== '1' && (!process.env.AUTH_TEST_DATABASE_URL || process.env.AUTH_TEST_ALLOW_DB_WRITE !== '1')) {
  console.error('Live smoke requires AUTH_TEST_DATABASE_URL for a disposable database and AUTH_TEST_ALLOW_DB_WRITE=1.');
  process.exit(1);
}
if (process.env.AUTH_SMOKE_CHILD !== '1') process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const { fork } = require('node:child_process');
const { PrismaClient } = require('../generated/prisma');
const { createApp } = require('../src/app');
const { hashPassword, hashToken } = require('../src/auth/credentials');
const { verifySessionLifecycle } = require('./helpers/session-lifecycle');

if (process.env.AUTH_SMOKE_CHILD === '1') {
  process.once('message', ({ port, captcha }) => {
    const prisma = new PrismaClient();
    const app = createApp({ prisma, authConfig: { appBaseUrl: `http://127.0.0.1:${port}`, cookieSecure: false, recaptchaSiteKey: 'smoke' },
      recaptchaVerifier: { async verify(value) { return { ok: value === captcha, reason: 'invalid' }; } },
      logoutRecaptchaVerifier: { siteKey: 'smoke-v2', isConfigured: () => true, async verify(value) { return { ok: value === captcha, reason: 'invalid' }; } } });
    const server = app.listen(port, '127.0.0.1', () => process.send({ ready: true }));
    server.on('error', error => { process.send({ error: error.message }); process.exitCode = 1; });
    process.on('message', message => { if (message === 'stop') server.close(async () => { await prisma.$disconnect(); process.exit(0); }); });
  });
} else {
  async function main() {
    if (!process.env.AUTH_TEST_DATABASE_URL || process.env.AUTH_TEST_ALLOW_DB_WRITE !== '1') throw new Error('Select a disposable auth test database explicitly.');
    const prisma = new PrismaClient();
    const id = crypto.randomBytes(12).toString('hex'), email = `smoke-${id}@example.invalid`, captcha = crypto.randomBytes(24).toString('hex'), password = crypto.randomBytes(24).toString('hex');
    let child, user, anonymousSid;
    const port = await new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); }); });
    async function start() { const c = fork(__filename, [], { env: { ...process.env, AUTH_SMOKE_CHILD: '1' }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }); await new Promise((resolve, reject) => { const timer = setTimeout(() => { c.kill(); reject(new Error('Child startup timed out')); }, 10000); c.once('exit', code => { clearTimeout(timer); reject(new Error(`Child exited ${code}`)); }); c.once('message', m => { clearTimeout(timer); m.ready ? resolve() : reject(new Error(m.error)); }); c.send({ port, captcha }); }); return c; }
    async function stop() { if (!child) return; const c = child; child = null; await new Promise((resolve, reject) => { const timer = setTimeout(() => { c.kill('SIGKILL'); reject(new Error('Child stop timed out')); }, 10000); c.once('exit', () => { clearTimeout(timer); resolve(); }); c.send('stop'); }); }
    const base = `http://127.0.0.1:${port}`;
    try {
      user = await prisma.user.create({ data: { emailOriginal: email, email, role: 'viewer', status: 'active', passwordHash: await hashPassword(password), emailVerifiedAt: new Date() } });
      child = await start();
      assert.equal((await fetch(base + '/dishes', { redirect: 'manual' })).status, 303);
      assert.equal((await fetch(base + '/admin/dishes', { redirect: 'manual' })).status, 303);
      const page = await fetch(base + '/login'), html = await page.text();
      const csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)[1], csrfCookie = page.headers.get('set-cookie').match(/sid=([a-f0-9]+)/)[1];
      anonymousSid = csrfCookie;
      async function login(pass) { return fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { cookie: `sid=${csrfCookie}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password: pass, _csrf: csrf, 'g-recaptcha-response': captcha }) }); }
      assert.equal((await login('incorrect')).status, 200);
      const response = await login(password); assert.equal(response.status, 303);
      const token = response.headers.get('set-cookie').match(/sid=([a-f0-9]+)/)[1];
      assert.notEqual(token, csrfCookie);
      const session = await prisma.session.findUnique({ where: { sidHash: hashToken(token) } });
      assert.ok(session);
      await verifySessionLifecycle({
        request: (route, options) => fetch(base + route, options),
        restart: async () => {
          const oldPid = child.pid;
          await stop();
          child = await start();
          assert.notEqual(child.pid, oldPid, 'Smoke must restart the actual server process');
        },
        findSession: () => prisma.session.findUnique({ where: { sidHash: hashToken(token) } }),
        sid: token, csrfToken: session.csrfToken, captchaProof: captcha
      });
      console.log('Live PostgreSQL login, CSRF and process-restart smoke passed.');
    } finally {
      await stop();
      if (user) await prisma.user.delete({ where: { id: user.id } });
      if (anonymousSid) await prisma.session.deleteMany({ where: { sidHash: hashToken(anonymousSid) } });
      await prisma.loginAttempt.deleteMany({ where: { emailKey: hashToken(email) } });
      await prisma.$disconnect();
    }
  }
  main().catch(() => { console.error('Live smoke failed; check test DB/schema. No credentials logged.'); process.exitCode = 1; });
}
