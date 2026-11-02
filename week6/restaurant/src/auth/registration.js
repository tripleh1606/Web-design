const express = require('express');
const nodemailer = require('nodemailer');
const { normalizeEmail, hashPassword, generateRawToken, hashToken, requireCsrf, createRecaptchaVerifier } = require('./session');
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function validateRegistrationInput(body) {
  const email = normalizeEmail(body.email), password = typeof body.password === 'string' ? body.password : '', errors = {};
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email không hợp lệ.';
  if (password.length < 8 || password.length > 128) errors.password = 'Mật khẩu phải có từ 8 đến 128 ký tự.';
  if (body.confirmPassword !== password) errors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
  return { values: { email: email.slice(0, 120) }, errors, password };
}

function createSmtpMailer(env = process.env) {
  const port = Number(env.SMTP_PORT || 587), secure = env.SMTP_SECURE === 'true';
  const configured = Boolean(env.SMTP_HOST && env.SMTP_FROM && Number.isInteger(port) && port > 0 && port <= 65535 && (!env.SMTP_SECURE || ['true', 'false'].includes(env.SMTP_SECURE)) && (!env.SMTP_USER === !env.SMTP_PASS));

  function getTransport() {
    if (!configured) throw new Error('SMTP not configured');
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
      connectionTimeout: 10000,
      socketTimeout: 10000
    });
  }

  return {
    isConfigured: () => configured,
    async sendVerificationEmail({ to, verifyUrl }) {
      const transport = getTransport();
      await transport.sendMail({
        from: env.SMTP_FROM,
        to,
        subject: 'Xác minh email Soucha',
        text: `Vui lòng xác minh email của bạn: ${verifyUrl}`
      });
    },
    async sendPasswordResetEmail({ to, resetUrl }) {
      const transport = getTransport();
      await transport.sendMail({
        from: env.SMTP_FROM,
        to,
        subject: 'Đặt lại mật khẩu Soucha',
        text: `Vui lòng đặt lại mật khẩu của bạn: ${resetUrl}\nLiên kết này sẽ hết hạn sau 15 phút.`
      });
    },
    async sendPasswordChangedNotice({ to }) {
      const transport = getTransport();
      await transport.sendMail({
        from: env.SMTP_FROM,
        to,
        subject: 'Mật khẩu Soucha đã được thay đổi',
        text: 'Mật khẩu tài khoản Soucha của bạn đã được thay đổi thành công. Nếu bạn không thực hiện thay đổi này, vui lòng liên hệ ngay với chúng tôi.'
      });
    }
  };
}

function createRegistrationRouter({ prisma, mailer, recaptchaVerifier, authConfig }) {
  const router = express.Router();
  const render = (res, status, values, errors = {}) => res.status(status).render('auth/register', { title: 'Đăng ký', values, errors, recaptchaSiteKey: authConfig.recaptchaSiteKey });
  const result = (res, status, ok) => res.status(status).render('auth/verify-result', { title: 'Xác minh email', status, heading: ok ? 'Xác minh thành công' : 'Liên kết không hợp lệ', message: ok ? 'Bạn có thể đăng nhập.' : 'Liên kết đã hết hạn hoặc đã được sử dụng.', actionHref: ok ? '/auth/login?verified=1' : '/auth/register', actionLabel: ok ? 'Đăng nhập' : 'Đăng ký lại' });

  router.get('/register', (req, res) => req.auth.user ? res.redirect(302, '/admin/dishes') : render(res, 200, { email: '' }));

  router.post('/register', requireCsrf, asyncRoute(async (req, res) => {
    const { values, errors, password } = validateRegistrationInput(req.body);
    if (Object.keys(errors).length) return render(res, 400, values, errors);
    const captcha = await recaptchaVerifier.verifyToken(req.body['g-recaptcha-response'], req.ip);
    if (!captcha.ok) return render(res, ['not-configured', 'network-error'].includes(captcha.reason) ? 503 : 400, values, { form: 'Không thể xác minh reCAPTCHA.' });
    if (!mailer.isConfigured()) return render(res, 503, values, { form: 'Dịch vụ email chưa sẵn sàng.' });
    const passwordHash = await hashPassword(password), raw = generateRawToken(), tokenHash = hashToken(raw);
    const created = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`registration:${values.email}`}, 0))`;
      let user = await tx.user.findUnique({ where: { email: values.email } });
      if (user) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        user = await tx.user.findUnique({ where: { id: user.id } });
        if (user.emailVerifiedAt) return false;
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        await tx.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      } else user = await tx.user.create({ data: { email: values.email, passwordHash } });
      await tx.emailVerificationToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + authConfig.emailVerifyTtlMs) } });
      return true;
    });
    if (!created) return render(res, 400, values, { email: 'Email đã được đăng ký.' });
    try {
      await mailer.sendVerificationEmail({ to: values.email, verifyUrl: `${authConfig.appBaseUrl}/auth/verify-email?token=${raw}` });
    } catch {
      return render(res, 503, values, { form: 'Không gửi được email xác minh. Vui lòng thử lại.' });
    }
    return res.render('auth/verify-result', { title: 'Kiểm tra email', status: 200, heading: 'Kiểm tra email', message: 'Chúng tôi đã gửi liên kết xác minh.', actionHref: '/auth/login', actionLabel: 'Đăng nhập' });
  }));

  router.get('/verify-email', asyncRoute(async (req, res) => {
    const raw = req.query.token;
    if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) return result(res, 400, false);
    const ok = await prisma.$transaction(async tx => {
      const token = await tx.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(raw) } });
      if (!token) return false;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${token.userId} FOR UPDATE`;
      const now = new Date();
      const claim = await tx.emailVerificationToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claim.count !== 1) return false;
      await tx.user.updateMany({ where: { id: token.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
      return true;
    });
    return result(res, ok ? 200 : 400, ok);
  }));

  return router;
}

module.exports = { validateRegistrationInput, createSmtpMailer, createRegistrationRouter };
