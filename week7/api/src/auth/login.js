const express = require('express');
const { normalizeEmail, validateEmail, verifyPassword, dummyVerify, hashToken } = require('./credentials');
const { jsonForm } = require('./form');
const { asyncRoute, ok, fail } = require('./response');
const { POLICY } = require('./config');

function createLoginRouter({ prisma, accessTokens, recaptchaVerifier, throttle }) {
  const router = express.Router();
  const { lock, lockUser, consume } = throttle;
  router.post('/login', jsonForm('email', 'password', 'g-recaptcha-response'), asyncRoute(async (req, res, next) => {
    const ipBudget = await prisma.$transaction(tx => consume(tx, {
      key: `login:ip:${hashToken(req.ip || 'unknown')}`, limit: POLICY.loginIpLimit, windowMs: POLICY.loginWindowMs
    }));
    if (!ipBudget.allowed) {
      res.set('Retry-After', String(ipBudget.retryAfter));
      return fail(res, 429, 'RATE_LIMITED', 'Quá nhiều yêu cầu. Vui lòng thử lại sau.');
    }
    next();
  }), asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email), password = req.body.password, emailKey = hashToken(email);
    if (!validateEmail(email) || typeof password !== 'string' || password.length < 1 || password.length > 128) {
      return fail(res, 400, 'VALIDATION_FAILED', 'Thông tin đăng nhập không hợp lệ.');
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
      // Lock and re-read credentials before deciding whether to issue a token.
      let user = await tx.user.findUnique({ where: { email } });
      if (user) {
        await lockUser(tx, user.id);
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
      await tx.loginAttempt.deleteMany({ where: { emailKey } });
      return { user: { id: user.id, email: user.email } };
    }, { timeout: 15000 });
    if (outcome.retry) {
      res.set('Retry-After', String(outcome.retry));
      return fail(res, 429, 'RATE_LIMITED', 'Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau.', { needsCaptcha: true });
    }
    if (outcome.captcha) return fail(res, outcome.unavailable ? 503 : 400,
      outcome.unavailable ? 'PROVIDER_UNAVAILABLE' : 'INVALID_CAPTCHA',
      outcome.unavailable ? 'Dịch vụ xác minh tạm thời không sẵn sàng.' : 'Vui lòng hoàn thành xác minh reCAPTCHA.', { needsCaptcha: true });
    if (outcome.invalid) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.', { needsCaptcha: outcome.needsCaptcha });
    if (outcome.pending) return fail(res, 403, 'ACCOUNT_PENDING', 'Vui lòng kích hoạt tài khoản bằng OTP trước khi đăng nhập.', { needsCaptcha: outcome.needsCaptcha });
    return ok(res, { user: outcome.user, accessToken: accessTokens.issue(outcome.user.id), tokenType: 'Bearer' });
  }));
  return router;
}
module.exports = { createLoginRouter };
