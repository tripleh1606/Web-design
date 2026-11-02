const express = require('express');
const { normalizeEmail, validateEmail, hashPassword, generateRawToken, hashToken, TOKEN } = require('./credentials');
const { requireCsrf, clearSessionCookie } = require('./session');
const { consume } = require('./throttle');
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const WINDOW_MS = 15 * 60_000;
const GENERIC_NOTICE = 'Nếu email của bạn tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu.';

function validateResetInput(body = {}) {
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};
  if (password.length < 8 || password.length > 128) errors.password = 'Mật khẩu phải có từ 8 đến 128 ký tự.';
  if (body.confirmPassword !== password) errors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
  return { errors, password };
}

function createPasswordResetRouter({ prisma, mailer, authConfig, logger = console }) {
  const router = express.Router();
  const renderForgot = (res, status, email = '', errors = {}, notice = '') => res.status(status).render('auth/forgot', {
    title: 'Quên mật khẩu', values: { email: email.slice(0, 254) }, errors, notice
  });
  const renderReset = (res, status, { invalid = false, token = '', errors = {} } = {}) => res.status(status).render('auth/reset', {
    title: invalid ? 'Liên kết không hợp lệ' : 'Đặt lại mật khẩu', invalid, token, errors
  });
  const limited = (res, retryAfter) => {
    res.set('Retry-After', String(retryAfter));
    return res.status(429).render('error', {
      title: 'Quá nhiều yêu cầu', status: 429, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', back: '/login'
    });
  };
  const quota = (purpose) => asyncRoute(async (req, res, next) => {
    const email = normalizeEmail(req.body?.email).slice(0, 254);
    const result = await prisma.$transaction(async tx => {
      const ip = await consume(tx, { key: `${purpose}:ip:${hashToken(req.ip || 'unknown')}`, limit: 20, windowMs: WINDOW_MS });
      if (!ip.allowed || purpose === 'reset') return ip;
      return consume(tx, { key: `forgot:email:${hashToken(email)}`, limit: 3, windowMs: WINDOW_MS });
    });
    if (!result.allowed) return limited(res, result.retryAfter);
    next();
  });
  const queueMail = (res, method, message) => {
    res.once('finish', () => setImmediate(() => Promise.resolve().then(() => {
      if (typeof mailer?.[method] !== 'function') throw new Error('Mailer unavailable');
      return mailer[method](message);
    }).catch(() => logger.error('Password email delivery failed', 'SMTP_DELIVERY_FAILED'))));
  };
  const validToken = (record, now = new Date()) => Boolean(record && !record.usedAt && !record.invalidatedAt && record.expiresAt > now);

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  router.get('/forgot', (req, res) => req.auth.user ? res.redirect(303, '/admin/dishes') : renderForgot(res, 200));
  router.post('/forgot', quota('forgot'), requireCsrf, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!validateEmail(email)) return renderForgot(res, 200, email, { email: 'VALIDATION_FAILED: Email không hợp lệ.' });
    if (!mailer?.isConfigured?.() || typeof mailer.sendPasswordResetEmail !== 'function') {
      return renderForgot(res, 500, email, { form: 'Dịch vụ email chưa sẵn sàng.' });
    }
    // Generate and hash regardless of account existence; never wait for SMTP.
    const rawToken = generateRawToken(), tokenHash = hashToken(rawToken);
    const outcome = await prisma.$transaction(async tx => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) return null;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      user = await tx.user.findUnique({ where: { id: user.id } });
      if (!user) return null;
      const now = new Date();
      await tx.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: now }
      });
      await tx.passwordReset.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(+now + WINDOW_MS) } });
      return { to: user.emailOriginal || user.email };
    });
    if (outcome) queueMail(res, 'sendPasswordResetEmail', {
      to: outcome.to, resetUrl: `${authConfig.appBaseUrl}/reset?token=${rawToken}`
    });
    return renderForgot(res, 200, email, {}, GENERIC_NOTICE);
  }));

  // Express also routes HEAD here: all reset methods consume the same IP budget.
  router.get('/reset', quota('reset'), asyncRoute(async (req, res) => {
    const rawToken = req.query.token;
    if (typeof rawToken !== 'string' || !TOKEN.test(rawToken)) return renderReset(res, 200, { invalid: true });
    const record = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    return validToken(record) ? renderReset(res, 200, { token: rawToken }) : renderReset(res, 200, { invalid: true });
  }));

  router.post('/reset', quota('reset'), requireCsrf, asyncRoute(async (req, res) => {
    const rawToken = req.body.token;
    if (typeof rawToken !== 'string' || !TOKEN.test(rawToken)) return renderReset(res, 200, { invalid: true });
    const { errors, password } = validateResetInput(req.body);
    if (Object.keys(errors).length) return renderReset(res, 200, { token: rawToken, errors });
    const tokenHash = hashToken(rawToken);
    const initial = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!validToken(initial)) return renderReset(res, 200, { invalid: true });
    // Hash before taking the shared User lock, then revalidate every token rule.
    const passwordHash = await hashPassword(password);
    const outcome = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${initial.userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: initial.userId } });
      const record = await tx.passwordReset.findUnique({ where: { tokenHash } });
      const now = new Date();
      if (!user || !validToken(record, now) || record.userId !== user.id) return { invalid: true };
      const claim = await tx.passwordReset.updateMany({
        where: { id: record.id, userId: user.id, usedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now }
      });
      if (claim.count !== 1) return { invalid: true };
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.passwordReset.updateMany({
        where: { userId: user.id, id: { not: record.id }, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now }
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      return { user };
    }, { timeout: 15000 });
    if (outcome.invalid) return renderReset(res, 200, { invalid: true });
    if (req.auth.user?.id === outcome.user.id) clearSessionCookie(res, authConfig);
    queueMail(res, 'sendPasswordChangedNotice', { to: outcome.user.emailOriginal || outcome.user.email });
    return res.redirect(303, '/login');
  }));
  return router;
}

module.exports = { createPasswordResetRouter, validateResetInput };
