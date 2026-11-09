const express = require('express');
const { normalizeEmail, validateEmail, hashPassword, generateRawToken, hashToken, TOKEN } = require('./credentials');
const { jsonForm } = require('./form');
const { asyncRoute, ok, fail } = require('./response');
const WINDOW_MS = 15 * 60_000;
const GENERIC_NOTICE = 'Nếu email của bạn tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu.';

function validateResetInput(body = {}) {
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};
  if (password.length < 8 || password.length > 128) errors.password = 'Mật khẩu phải có từ 8 đến 128 ký tự.';
  if (body.confirmPassword !== password) errors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
  return { errors, password };
}

function createPasswordResetRouter({ prisma, mailer, authConfig, throttle, logger = console }) {
  const router = express.Router();
  const { lock, lockUser, consume } = throttle;
  const invalidReset = (res) => fail(res, 400, 'INVALID_RESET', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
  const limited = (res, retryAfter) => {
    res.set('Retry-After', String(retryAfter));
    return fail(res, 429, 'RATE_LIMITED', 'Quá nhiều yêu cầu. Vui lòng thử lại sau.');
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

  router.post('/forgot', jsonForm('email'), quota('forgot'), asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!validateEmail(email)) return fail(res, 400, 'VALIDATION_FAILED', 'Email không hợp lệ.');
    if (!mailer?.isConfigured?.() || typeof mailer.sendPasswordResetEmail !== 'function') {
      return fail(res, 503, 'PROVIDER_UNAVAILABLE', 'Dịch vụ email chưa sẵn sàng.');
    }
    // Generate and hash regardless of account existence; never wait for SMTP.
    const rawToken = generateRawToken(), tokenHash = hashToken(rawToken);
    const outcome = await prisma.$transaction(async tx => {
      await lock(tx, `forgot:${hashToken(email)}`);
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) return null;
      await lockUser(tx, user.id);
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
    return ok(res, { notice: GENERIC_NOTICE });
  }));

  // Express also routes HEAD here: all reset methods consume the same IP budget.
  router.get('/reset', quota('reset'), asyncRoute(async (req, res) => {
    const rawToken = req.query.token;
    if (typeof rawToken !== 'string' || !TOKEN.test(rawToken)) return invalidReset(res);
    const record = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    return validToken(record) ? ok(res, { valid: true }) : invalidReset(res);
  }));

  router.post('/reset', jsonForm('token', 'password', 'confirmPassword'), quota('reset'), asyncRoute(async (req, res) => {
    const rawToken = req.body.token;
    if (typeof rawToken !== 'string' || !TOKEN.test(rawToken)) return invalidReset(res);
    const { errors, password } = validateResetInput(req.body);
    if (Object.keys(errors).length) return fail(res, 400, 'VALIDATION_FAILED', 'Mật khẩu không hợp lệ.', { fields: errors });
    const tokenHash = hashToken(rawToken);
    const initial = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!validToken(initial)) return invalidReset(res);
    // Hash before taking the shared User lock, then revalidate every token rule.
    const passwordHash = await hashPassword(password);
    const outcome = await prisma.$transaction(async tx => {
      await lockUser(tx, initial.userId);
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
      // A shared database can still have Week 6 cookie sessions to revoke.
      await tx.session.deleteMany({ where: { userId: user.id } });
      return { user };
    }, { timeout: 15000 });
    if (outcome.invalid) return invalidReset(res);
    queueMail(res, 'sendPasswordChangedNotice', { to: outcome.user.emailOriginal || outcome.user.email });
    return ok(res, { notice: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' });
  }));
  return router;
}

module.exports = { createPasswordResetRouter, validateResetInput };
