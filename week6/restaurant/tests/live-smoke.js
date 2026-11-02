require('dotenv').config();
if (process.env.AUTH_SMOKE_CHILD !== '1' && (!process.env.DATABASE_URL || process.env.LIVE_SMOKE_ALLOW_DB_WRITE !== '1')) {
  console.error('Live smoke requires DATABASE_URL for a disposable database and LIVE_SMOKE_ALLOW_DB_WRITE=1.');
  process.exit(1);
}
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const { fork } = require('node:child_process');
const { PrismaClient } = require('../generated/prisma');
const { createApp } = require('../src/app');
const { hashPassword, hashToken } = require('../src/auth/session');

if (process.env.AUTH_SMOKE_CHILD === '1') {
  process.once('message', ({ port, captcha }) => {
    const prisma = new PrismaClient();
    const app = createApp({ prisma, authConfig: { appBaseUrl: `http://127.0.0.1:${port}`, cookieSecure: false, recaptchaSiteKey: 'smoke' }, recaptchaVerifier: { async verifyToken(value) { return { ok: value === captcha, reason: 'verification-failed' }; } } });
    const server = app.listen(port, '127.0.0.1', () => process.send({ ready: true }));
    server.on('error', error => { process.send({ error: error.message }); process.exitCode = 1; });
    process.on('message', message => { if (message === 'stop') server.close(async () => { await prisma.$disconnect(); process.exit(0); }); });
  });
} else {
  async function main() {
    if (!process.env.DATABASE_URL || process.env.LIVE_SMOKE_ALLOW_DB_WRITE !== '1') throw new Error('Set DATABASE_URL to a disposable database and LIVE_SMOKE_ALLOW_DB_WRITE=1.');
    const prisma = new PrismaClient();
    const id = crypto.randomBytes(12).toString('hex'), email = `smoke-${id}@example.invalid`, captcha = crypto.randomBytes(24).toString('hex'), password = crypto.randomBytes(24).toString('hex');
    let child, user;
    const port = await new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); }); });
    async function start() { const c = fork(__filename, [], { env: { ...process.env, AUTH_SMOKE_CHILD: '1' }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }); await new Promise((resolve, reject) => { const timer = setTimeout(() => { c.kill(); reject(new Error('Child startup timed out')); }, 10000); c.once('exit', code => { clearTimeout(timer); reject(new Error(`Child exited ${code}`)); }); c.once('message', m => { clearTimeout(timer); m.ready ? resolve() : reject(new Error(m.error)); }); c.send({ port, captcha }); }); return c; }
    async function stop() { if (!child) return; const c = child; child = null; await new Promise((resolve, reject) => { const timer = setTimeout(() => { c.kill('SIGKILL'); reject(new Error('Child stop timed out')); }, 10000); c.once('exit', () => { clearTimeout(timer); resolve(); }); c.send('stop'); }); }
    const base = `http://127.0.0.1:${port}`;
    try {
      user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password), emailVerifiedAt: new Date() } });
      child = await start();
      assert.equal((await fetch(base + '/dishes')).status, 200);
      assert.equal((await fetch(base + '/admin/dishes', { redirect: 'manual' })).status, 302);
      const page = await fetch(base + '/auth/login'), html = await page.text();
      const csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)[1], csrfCookie = page.headers.get('set-cookie').match(/soucha_csrf=([a-f0-9]+)/)[1];
      async function login(pass) { return fetch(base + '/auth/login', { method: 'POST', redirect: 'manual', headers: { cookie: `soucha_csrf=${csrfCookie}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password: pass, _csrf: csrf, 'g-recaptcha-response': captcha }) }); }
      assert.equal((await login('incorrect')).status, 401);
      const response = await login(password); assert.equal(response.status, 303);
      const token = response.headers.get('set-cookie').match(/soucha_session=([a-f0-9]+)/)[1];
      assert.ok(await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } }));
      const headers = { cookie: `soucha_session=${token}` };
      assert.equal((await fetch(base + '/admin/dishes', { headers, redirect: 'manual' })).status, 200);
      assert.equal((await fetch(base + '/admin/dishes', { method: 'POST', headers, redirect: 'manual' })).status, 403);
      const oldPid = child.pid; await stop(); child = await start(); assert.notEqual(child.pid, oldPid);
      assert.equal((await fetch(base + '/admin/dishes', { headers, redirect: 'manual' })).status, 200);
      console.log('Live PostgreSQL login, CSRF and process-restart smoke passed.');
    } finally { await stop(); if (user) await prisma.user.delete({ where: { id: user.id } }); await prisma.loginAttempt.deleteMany({ where: { email } }); await prisma.$disconnect(); }
  }
  main().catch(error => { console.error('Live smoke failed:', error.message); process.exitCode = 1; });
}
