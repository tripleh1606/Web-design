const express = require('express');
const { normalizeEmail, validateEmail, verifyPassword, dummyVerify, hashToken } = require('./credentials');
const { requireCsrf, createSessionForUser, setSessionCookie } = require('./session');
const { lock, consume } = require('./throttle');
const { POLICY } = require('./config');
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createLoginRouter({ prisma, authConfig, recaptchaVerifier }) {
  const router = express.Router();
  const render = (res, status, email, { errors = {}, notice = '', needsCaptcha = false, errorCode = '' } = {}) =>
    res.status(status).render('auth/login', { title: 'Đăng nhập', values: { email }, errors, notice, needsCaptcha, errorCode,
      recaptchaSiteKey: authConfig.recaptchaSiteKey });
  router.get('/login', (req, res) => req.auth.user ? res.redirect(303, '/admin/dishes') : render(res, 200, ''));
  router.post('/login', asyncRoute(async (req, res, next) => {
    const ipBudget = await prisma.$transaction(tx => consume(tx, {
      key: `login:ip:${hashToken(req.ip || 'unknown')}`, limit: POLICY.loginIpLimit, windowMs: POLICY.loginWindowMs
    }));
    if (!ipBudget.allowed) {
      res.set('Retry-After', String(ipBudget.retryAfter));
      return render(res, 429, normalizeEmail(req.body.email).slice(0, 254), { errors: { form: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }, errorCode: 'RATE_LIMITED' });
    }
    next();
  }), requireCsrf, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email), password = req.body.password, emailKey = hashToken(email);
    if (!validateEmail(email) || typeof password !== 'string' || password.length < 1 || password.length > 128) {
      return render(res, 200, email.slice(0, 254), { errors: { form: 'Thông tin đăng nhập không hợp lệ.' }, errorCode: 'VALIDATION_FAILED' });
    }
    const readAttempt = async tx => {
      await lock(tx, `login:${emailKey}`);
      let attempt = await tx.loginAttempt.findUnique({ where: { emailKey } });
      const now = new Date();
      if (attempt?.lockedUntil > now) return { retry: Math.max(1, Math.ceil((attempt.lockedUntil - now) / 1000)) };
      if (attempt && now - attempt.windowStartedAt >= POLICY.loginWindowMs) {
        await tx.loginAttempt.deleteMany({ where: { emailKey } });
        attempt = null;
      }
      return { attempt, needsCaptcha: (attempt?.failedCount || 0) >= POLICY.loginCaptchaThreshold };
    };
    // Provider latency must not hold an interactive transaction or a database lock.
    const snapshot = await prisma.$transaction(readAttempt);
    let proof;
    if (!snapshot.retry && snapshot.needsCaptcha) {
      proof = await recaptchaVerifier.verify(req.body['g-recaptcha-response'], 'login');
    }
    const outcome = snapshot.retry ? snapshot : await prisma.$transaction(async tx => {
      // Another request may have crossed the threshold while the provider was running.
      const current = await readAttempt(tx);
      if (current.retry) return current;
      const { attempt, needsCaptcha } = current;
      if ((needsCaptcha && !proof?.ok) || (proof && !proof.ok)) {
        return { captcha: true, unavailable: proof?.reason === 'unavailable' };
      }
      // Lock and re-read the user so password resets cannot race session creation.
      let user = await tx.user.findUnique({ where: { email } });
      if (user) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        user = await tx.user.findUnique({ where: { id: user.id } });
      }
      const valid = user ? await verifyPassword(password, user.passwordHash) : await dummyVerify(password);
      const now = new Date();
      if (!user || !valid) {
        const failedCount = (attempt?.failedCount || 0) + 1;
        const lockedUntil = failedCount >= POLICY.loginLockThreshold ? new Date(now.getTime() + POLICY.loginLockMs) : null;
        const data = { failedCount, windowStartedAt: attempt?.windowStartedAt || now, lockedUntil };
        await tx.loginAttempt.upsert({ where: { emailKey }, create: { emailKey, ...data }, update: data });
        return lockedUntil ? { retry: POLICY.loginLockMs / 1000 } : { invalid: true, needsCaptcha: failedCount >= POLICY.loginCaptchaThreshold };
      }
      if (user.status !== 'active' || !user.emailVerifiedAt) return { pending: true, needsCaptcha };
      const session = await createSessionForUser({ prisma: tx, userId: user.id, authConfig });
      if (req.auth.rawToken) await tx.session.deleteMany({ where: { sidHash: hashToken(req.auth.rawToken) } });
      await tx.loginAttempt.deleteMany({ where: { emailKey } });
      return { session };
    }, { timeout: 15000 });
    if (outcome.retry) {
      res.set('Retry-After', String(outcome.retry));
      return render(res, 429, email, { errors: { form: 'Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau.' }, needsCaptcha: true, errorCode: 'RATE_LIMITED' });
    }
    if (outcome.captcha) return render(res, outcome.unavailable ? 500 : 200, email, {
      errors: { form: outcome.unavailable ? 'Dịch vụ xác minh tạm thời không sẵn sàng.' : 'Vui lòng hoàn thành xác minh CAPTCHA.' },
      needsCaptcha: true, errorCode: outcome.unavailable ? 'PROVIDER_ERROR' : 'INVALID_CAPTCHA'
    });
    if (outcome.invalid) return render(res, 200, email, { errors: { form: 'Email hoặc mật khẩu không đúng.' }, needsCaptcha: outcome.needsCaptcha, errorCode: 'INVALID_CREDENTIALS' });
    if (outcome.pending) return render(res, 200, email, { notice: 'Vui lòng kích hoạt tài khoản bằng OTP trước khi đăng nhập.', needsCaptcha: outcome.needsCaptcha });
    setSessionCookie(res, outcome.session.rawToken, authConfig);
    return res.redirect(303, '/admin/dishes');
  }));
  return router;
}
module.exports = { createLoginRouter };
