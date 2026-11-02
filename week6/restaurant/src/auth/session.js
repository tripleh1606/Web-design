const express = require('express');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const TOKEN = /^[a-f0-9]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function resolveAuthConfig(overrides = {}) {
  const production = process.env.NODE_ENV === 'production';
  const origin = overrides.appBaseUrl ?? process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT || 3001}`;
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (production && (!process.env.APP_BASE_URL && !overrides.appBaseUrl || url.protocol !== 'https:'))) throw new Error('Invalid APP_BASE_URL');
  function ttl(key, env) {
    const n = overrides[key] ?? (process.env[env] === undefined ? 86400000 : Number(process.env[env]) * 3600000);
    if (!Number.isSafeInteger(n) || n <= 0 || (overrides[key] === undefined && process.env[env] !== undefined && !Number.isInteger(Number(process.env[env])))) throw new Error(`Invalid ${env}`);
    return n;
  }
  return { appBaseUrl: url.origin, sessionCookieName: overrides.sessionCookieName ?? process.env.SESSION_COOKIE_NAME ?? 'soucha_session', csrfCookieName: overrides.csrfCookieName ?? 'soucha_csrf', sessionTtlMs: ttl('sessionTtlMs', 'SESSION_TTL_HOURS'), emailVerifyTtlMs: ttl('emailVerifyTtlMs', 'EMAIL_VERIFY_TTL_HOURS'), cookieSecure: overrides.cookieSecure ?? (production || url.protocol === 'https:'), recaptchaSiteKey: overrides.recaptchaSiteKey ?? process.env.RECAPTCHA_SITE_KEY ?? '', recaptchaSecretKey: overrides.recaptchaSecretKey ?? process.env.RECAPTCHA_SECRET_KEY ?? '' };
}

const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
async function hashPassword(password) { const salt = crypto.randomBytes(16); const key = await scrypt(password, salt, 64); return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`; }
async function verifyPassword(password, hash) { if (typeof hash !== 'string' || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)) return false; const [, salt, key] = hash.split('$'); const actual = await scrypt(password, Buffer.from(salt, 'hex'), 64); return crypto.timingSafeEqual(actual, Buffer.from(key, 'hex')); }
const generateRawToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const safeEqualToken = (a, b) => typeof a === 'string' && typeof b === 'string' && TOKEN.test(a) && TOKEN.test(b) && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
function parseCookies(header = '') { const result = Object.create(null), seen = new Set(); for (const pair of header.split(';')) { const pos = pair.indexOf('='); if (pos < 1) continue; const name = pair.slice(0, pos).trim(); if (seen.has(name)) { delete result[name]; continue; } seen.add(name); try { result[name] = decodeURIComponent(pair.slice(pos + 1).trim()); } catch {} } return result; }
function serializeCookie(name, value, options = {}) { let out = `${name}=${encodeURIComponent(value)}`; if (options.maxAge !== undefined) out += `; Max-Age=${options.maxAge}`; if (options.expires) out += `; Expires=${options.expires.toUTCString()}`; if (options.path) out += `; Path=${options.path}`; if (options.httpOnly) out += '; HttpOnly'; if (options.secure) out += '; Secure'; if (options.sameSite) out += `; SameSite=${options.sameSite}`; return out; }
const cookieOptions = config => ({ httpOnly: true, secure: config.cookieSecure, sameSite: 'Lax', path: '/' });
function setSessionCookie(res, token, config) { res.append('Set-Cookie', serializeCookie(config.sessionCookieName, token, { ...cookieOptions(config), maxAge: Math.floor(config.sessionTtlMs / 1000) })); }
function clearSessionCookie(res, config) { res.append('Set-Cookie', serializeCookie(config.sessionCookieName, '', { ...cookieOptions(config), maxAge: 0, expires: new Date(0) })); }
function sanitizeNextPath(value) { if (typeof value !== 'string' || value.length > 200 || /[\\\x00-\x1f\x7f]/.test(value) || !value.startsWith('/') || value.startsWith('//')) return '/admin/dishes'; try { const path = value.split('?')[0]; if (/%(?:2f|5c)/i.test(path)) return '/admin/dishes'; const url = new URL(value, 'http://localhost'); if (url.origin !== 'http://localhost' || !(url.pathname === '/admin' || url.pathname.startsWith('/admin/'))) return '/admin/dishes'; url.searchParams.delete('_method'); return url.pathname + url.search; } catch { return '/admin/dishes'; } }
async function createSessionForUser({ prisma, userId, authConfig, res }) { const rawToken = generateRawToken(), tokenHash = hashToken(rawToken), csrfToken = generateRawToken(), expiresAt = new Date(Date.now() + authConfig.sessionTtlMs); await prisma.session.create({ data: { tokenHash, csrfToken, expiresAt, userId } }); if (res) setSessionCookie(res, rawToken, authConfig); return { rawToken, tokenHash, csrfToken, expiresAt }; }

function attachSessionMiddleware({ prisma, authConfig }) {
  return asyncRoute(async (req, res, next) => {
    req.authConfig = authConfig;
    req.cookies = parseCookies(req.headers.cookie);
    req.auth = { user: null, session: null, rawToken: null };
    res.locals.currentUser = null;
    res.locals.csrfToken = '';
    const raw = req.cookies[authConfig.sessionCookieName];
    if (raw !== undefined) {
      if (TOKEN.test(raw)) {
        const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: true } });
        if (session && session.expiresAt > new Date() && session.user.emailVerifiedAt) {
          req.auth = { user: session.user, session, rawToken: raw };
          res.locals.currentUser = { id: session.user.id, email: session.user.email };
          res.locals.csrfToken = session.csrfToken;
        } else {
          if (session && session.expiresAt <= new Date()) await prisma.session.deleteMany({ where: { tokenHash: hashToken(raw), expiresAt: { lte: new Date() } } });
          clearSessionCookie(res, authConfig);
        }
      } else clearSessionCookie(res, authConfig);
    }
    if (!req.auth.user && req.method === 'GET' && (req.path.startsWith('/auth/') || ['/forgot', '/reset', '/login', '/register'].includes(req.path))) {
      let token = req.cookies[authConfig.csrfCookieName];
      if (!TOKEN.test(token || '')) {
        token = generateRawToken();
        res.append('Set-Cookie', serializeCookie(authConfig.csrfCookieName, token, { ...cookieOptions(authConfig), maxAge: 7200 }));
      }
      res.locals.csrfToken = token;
    }
    next();
  });
}

function requireCsrf(req, res, next) {
  const origin = req.get('Origin') || req.get('Referer');
  let validOrigin = true;
  if (origin) {
    try {
      validOrigin = new URL(origin).origin === req.authConfig.appBaseUrl;
    } catch {
      validOrigin = false;
    }
  }
  const expected = req.auth.session?.csrfToken || req.cookies[req.authConfig.csrfCookieName];
  if (!validOrigin || !safeEqualToken(expected, req.body?._csrf)) {
    return res.status(403).render('error', { title: 'Không được phép', status: 403, message: 'Yêu cầu không hợp lệ.', back: '/dishes' });
  }
  next();
}

function requireAdminAuth(req, res, next) {
  if (req.auth.user) return next();
  return ['GET', 'HEAD'].includes(req.method) ? res.redirect(302, `/auth/login?next=${encodeURIComponent(sanitizeNextPath(req.originalUrl))}`) : res.redirect(303, '/auth/login');
}

function createRecaptchaVerifier(env = process.env, fetchImpl = globalThis.fetch) {
  const siteKey = env.RECAPTCHA_SITE_KEY || '', secret = env.RECAPTCHA_SECRET_KEY || '';
  let hostname;
  try { hostname = new URL(env.APP_BASE_URL).hostname; } catch {}
  return {
    siteKey,
    isConfigured: () => Boolean(siteKey && secret && hostname),
    async verifyToken(token, remoteIp) {
      if (!siteKey || !secret || !hostname) return { ok: false, reason: 'not-configured' };
      if (typeof token !== 'string' || !token) return { ok: false, reason: 'missing-input-response' };
      try {
        const body = new URLSearchParams({ secret, response: token });
        if (remoteIp) body.set('remoteip', remoteIp);
        const response = await fetchImpl('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(10000) });
        if (!response.ok) return { ok: false, reason: 'network-error' };
        const result = await response.json();
        return result.success === true && result.hostname === hostname ? { ok: true, reason: null } : { ok: false, reason: 'verification-failed' };
      } catch {
        return { ok: false, reason: 'network-error' };
      }
    }
  };
}

function createLoginRouter({ prisma, authConfig, recaptchaVerifier }) {
  const router = express.Router();
  const render = (res, status, email, next, errors = {}, notice = '') => res.status(status).render('auth/login', { title: 'Đăng nhập', values: { email, next }, errors, notice, recaptchaSiteKey: authConfig.recaptchaSiteKey });
  router.get('/login', (req, res) => {
    const next = sanitizeNextPath(req.query.next);
    if (req.auth.user) return res.redirect(302, next);
    return render(res, 200, '', next, {}, req.query.verified === '1' ? 'Email đã được xác minh.' : req.query.loggedOut === '1' ? 'Đã đăng xuất.' : req.query.reset === '1' ? 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập.' : '');
  });

  router.post('/login', requireCsrf, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email), next = sanitizeNextPath(req.body.next), password = req.body.password;
    if (!EMAIL.test(email) || email.length > 120 || typeof password !== 'string' || !password || password.length > 128) return render(res, 400, email.slice(0, 120), next, { form: 'Thông tin đăng nhập không hợp lệ.' });
    const ip = req.ip || 'unknown';
    const ipResult = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`login-ip:${ip}`}, 0))`;
      const now = new Date();
      const row = await tx.loginIpLimit.findUnique({ where: { ip } });
      if (!row || now - row.windowStart >= 60000) {
        await tx.loginIpLimit.upsert({ where: { ip }, create: { ip, count: 1, windowStart: now }, update: { count: 1, windowStart: now } });
        return 0;
      }
      if (row.count >= 20) return Math.max(1, Math.ceil((60000 - (now - row.windowStart)) / 1000));
      await tx.loginIpLimit.update({ where: { ip }, data: { count: { increment: 1 } } });
      return 0;
    });
    if (ipResult) {
      res.set('Retry-After', String(ipResult));
      return render(res, 429, email, next, { form: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' });
    }
    const existing = await prisma.loginAttempt.findUnique({ where: { email } });
    if (existing?.lockedUntil && existing.lockedUntil > new Date() && Date.now() - existing.lastFailure < 86400000) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((existing.lockedUntil - Date.now()) / 1000))));
      return render(res, 429, email, next, { form: 'Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau.' });
    }
    const captcha = await recaptchaVerifier.verifyToken(req.body['g-recaptcha-response'], ip);
    if (!captcha.ok) return render(res, ['not-configured', 'network-error'].includes(captcha.reason) ? 503 : 400, email, next, { form: 'Không thể xác minh reCAPTCHA. Vui lòng thử lại.' });

    const outcome = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`login-email:${email}`}, 0))`;
      const now = new Date();
      let attempt = await tx.loginAttempt.findUnique({ where: { email } });
      if (attempt && now - attempt.lastFailure >= 86400000) {
        await tx.loginAttempt.delete({ where: { email } });
        attempt = null;
      }
      if (attempt?.lockedUntil && attempt.lockedUntil > now) return { retry: Math.max(1, Math.ceil((attempt.lockedUntil - now) / 1000)) };
      const user = await tx.user.findUnique({ where: { email } });
      const valid = await verifyPassword(password, user?.passwordHash || DUMMY_HASH);
      if (!user || !valid) {
        const failures = (attempt?.failures || 0) + 1;
        const delay = failures >= 3 ? Math.min(900, 30 * 2 ** Math.min(failures - 3, 5)) : 0;
        await tx.loginAttempt.upsert({
          where: { email },
          create: { email, failures, lastFailure: now, lockedUntil: delay ? new Date(now.getTime() + delay * 1000) : null },
          update: { failures, lastFailure: now, lockedUntil: delay ? new Date(now.getTime() + delay * 1000) : null }
        });
        return { invalid: true };
      }
      if (!user.emailVerifiedAt) return { unverified: true };
      if (attempt) await tx.loginAttempt.delete({ where: { email } });
      if (req.auth.rawToken) await tx.session.deleteMany({ where: { tokenHash: hashToken(req.auth.rawToken) } });
      return { session: await createSessionForUser({ prisma: tx, userId: user.id, authConfig }) };
    });

    if (outcome.retry) {
      res.set('Retry-After', String(outcome.retry));
      return render(res, 429, email, next, { form: 'Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau.' });
    }
    if (outcome.invalid) return render(res, 401, email, next, { form: 'Email hoặc mật khẩu không đúng.' });
    if (outcome.unverified) return render(res, 403, email, next, { form: 'Vui lòng xác minh email trước khi đăng nhập.' });
    setSessionCookie(res, outcome.session.rawToken, authConfig);
    return res.redirect(303, next);
  }));

  return router;
}

function createLogoutRouter({ prisma, authConfig }) {
  const router = express.Router();
  router.post('/logout', requireCsrf, asyncRoute(async (req, res) => {
    const raw = req.auth.rawToken || req.cookies[authConfig.sessionCookieName];
    if (typeof raw === 'string' && TOKEN.test(raw)) await prisma.session.deleteMany({ where: { tokenHash: hashToken(raw) } });
    clearSessionCookie(res, authConfig);
    res.redirect(303, '/auth/login?loggedOut=1');
  }));
  return router;
}

module.exports = {
  resolveAuthConfig,
  normalizeEmail,
  hashPassword,
  verifyPassword,
  generateRawToken,
  hashToken,
  safeEqualToken,
  parseCookies,
  serializeCookie,
  setSessionCookie,
  clearSessionCookie,
  sanitizeNextPath,
  createSessionForUser,
  attachSessionMiddleware,
  requireCsrf,
  requireAdminAuth,
  createRecaptchaVerifier,
  createLoginRouter,
  createLogoutRouter
};
