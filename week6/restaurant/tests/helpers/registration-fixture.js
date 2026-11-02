const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { createApp } = require('../../src/app');

function memoryPrisma() {
  let tables = Object.fromEntries(['user', 'activationChallenge', 'activationAttempt', 'rateLimitBucket', 'session', 'loginAttempt', 'loginIpLimit'].map(name => [name, []]));
  const copy = value => structuredClone(value);
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('gt' in value) return row[key] > value.gt;
        if ('lte' in value) return row[key] <= value.lte;
        if ('not' in value) return row[key] !== value.not;
      }
      return row[key] === value;
    });
  }
  function assign(row, data) {
    for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : copy(value);
    return copy(row);
  }
  const prisma = { dish: { async findMany() { throw new Error('Unexpected CRUD query'); } }, chef: {}, ingredient: {}, dishIngredient: {}, chefDish: {} };
  for (const name of Object.keys(tables)) {
    prisma[name] = {
      async findUnique({ where, include }) {
        const row = tables[name].find(row => matches(row, where));
        if (!row) return null;
        return { ...copy(row), ...(include?.user ? { user: copy(tables.user.find(user => user.id === row.userId) || null) } : {}) };
      },
      async findMany({ where } = {}) { return copy(tables[name].filter(row => matches(row, where))); },
      async count({ where } = {}) { return tables[name].filter(row => matches(row, where)).length; },
      async create({ data }) {
        const row = { ...(name === 'user' ? { id: tables.user.length + 1, emailVerifiedAt: null, status: 'pending', role: 'viewer' } : {}), ...copy(data) };
        tables[name].push(row);
        return copy(row);
      },
      async update({ where, data }) {
        const row = tables[name].find(row => matches(row, where));
        assert.ok(row, `Missing ${name} row`);
        return assign(row, data);
      },
      async upsert({ where, create, update }) {
        const row = tables[name].find(row => matches(row, where));
        return row ? assign(row, update) : this.create({ data: create });
      },
      async updateMany({ where, data }) {
        const rows = tables[name].filter(row => matches(row, where));
        rows.forEach(row => assign(row, data));
        return { count: rows.length };
      },
      async delete({ where }) { const i = tables[name].findIndex(row => matches(row, where)); return tables[name].splice(i, 1)[0]; },
      async deleteMany({ where } = {}) {
        const before = tables[name].length;
        tables[name] = tables[name].filter(row => !matches(row, where));
        return { count: before - tables[name].length };
      }
    };
  }
  prisma.$executeRaw = async () => {};
  prisma.$queryRaw = async () => [];
  // This fake checks rollback/HTTP behavior; it is deliberately NOT concurrency evidence.
  let queue = Promise.resolve();
  prisma.$transaction = callback => {
    const task = queue.then(async () => {
      const before = copy(tables);
      try { return await callback(prisma); } catch (error) { tables = before; throw error; }
    });
    queue = task.catch(() => {});
    return task;
  };
  return prisma;
}

async function registrationFixture(t, options = {}) {
  const prisma = options.prisma || memoryPrisma();
  const sent = [], logs = [], captchaCalls = [], usedCaptcha = new Set();
  let now = Date.now(), captchaNumber = 0;
  const captcha = options.captcha || {
    async verifyToken(token, ip, action) {
      captchaCalls.push({ token, ip, action });
      if (token === 'provider-error') return { ok: false, reason: 'network-error' };
      if (!token?.startsWith('captcha-') || usedCaptcha.has(token)) return { ok: false, reason: 'invalid' };
      usedCaptcha.add(token);
      return { ok: action === 'register' || action === 'login' };
    }
  };
  const mailer = options.mailer || { async sendActivationOtp(message) { sent.push(message); } };
  const app = createApp({ prisma, mailer, recaptchaVerifier: captcha, logger: { error(...args) { logs.push(args); } },
    clock: () => new Date(now), authConfig: { appBaseUrl: 'http://localhost:3001', recaptchaSiteKey: 'test-site', registration: options.policy } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '', csrf = '';
  async function get(path = '/register', headers = {}) {
    const response = await fetch(base + path, { redirect: 'manual', headers: { connection: 'close', ...(cookie ? { cookie } : {}), ...headers } });
    const html = await response.text();
    const raw = response.headers.get('set-cookie')?.match(/soucha_csrf=([a-f0-9]{64})/);
    if (raw) cookie = `soucha_csrf=${raw[1]}`;
    const match = html.match(/name="_csrf" value="([a-f0-9]{64})"/);
    if (match) csrf = match[1];
    return { status: response.status, html, headers: response.headers };
  }
  async function post(path, body = {}, headers = {}) {
    const response = await fetch(base + path, { method: 'POST', redirect: 'manual',
      headers: { connection: 'close', cookie, 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams({ _csrf: csrf, ...body }) });
    return { status: response.status, html: await response.text(), headers: response.headers };
  }
  const register = (email = 'Person@Example.COM', extra = {}) => post('/register', {
    email, password: 'original-password', confirmPassword: 'original-password', 'g-recaptcha-response': `captcha-${++captchaNumber}`, ...extra
  });
  await get();
  async function mail(count = 1) {
    for (let i = 0; i < 200 && sent.length < count; i++) await delay(5);
    assert.ok(sent.length >= count, `Expected ${count} captured email(s), got ${sent.length}`);
    return sent[count - 1];
  }
  return { prisma, get, post, register, sent, logs, captchaCalls, mail, advance(ms) { now += ms; }, now: () => now,
    credentials: () => ({ cookie, csrf }), base };
}

module.exports = { memoryPrisma, registrationFixture };
