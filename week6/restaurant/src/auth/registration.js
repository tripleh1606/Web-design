const express = require('express');
const { requireCsrf } = require('./session');
const { normalizeEmail, validEmail, hashPassword, generateOtp, hashOtp, verifyOtp } = require('./credentials');
const { registrationPolicy } = require('./config');
const { consumeBuckets, lockActivationAttempt, emailKey, retrySeconds } = require('./throttle');
const { dispatchActivationAfterResponse, createSmtpMailer } = require('./mail');
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const GENERIC_NOTICE = 'Nếu địa chỉ email đủ điều kiện, mã kích hoạt sẽ được gửi. Vui lòng kiểm tra email hoặc thử gửi lại sau.';

function validateRegistrationInput(body = {}) {
  const emailOriginal = typeof body.email === 'string' ? body.email.trim() : '';
  const email = normalizeEmail(body.email), password = typeof body.password === 'string' ? body.password : '', errors = {};
  if (!validEmail(email)) errors.email = 'Email không hợp lệ.';
  if ([...password].length < 8 || [...password].length > 128) errors.password = 'Mật khẩu phải có từ 8 đến 128 ký tự.';
  if (body.confirmPassword !== password) errors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
  return { values: { email: emailOriginal.slice(0, 254) }, email, emailOriginal, errors, password };
}

function createRegistrationRouter({ prisma, mailer, recaptchaVerifier, authConfig, logger = console, clock = () => new Date() }) {
  const router = express.Router(), policy = registrationPolicy(authConfig.registration);
  const render = (res, view, { status = 200, email = '', errors = {}, code = null, notice = '', activated = false } = {}) => {
    res.set('Cache-Control', 'no-store');
    return res.status(status).render(`auth/${view}`, {
      title: view === 'register' ? 'Đăng ký' : 'Kích hoạt tài khoản', values: { email: email.slice(0, 254) }, errors,
      error: code ? { code } : null, notice, activated, recaptchaSiteKey: authConfig.recaptchaSiteKey
    });
  };
  function limited(res, view, email, retry) {
    res.set('Retry-After', String(retry));
    return render(res, view, { status: 429, email, code: 'RATE_LIMITED', errors: { form: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' } });
  }
  const dispatchSpecs = (email, ip) => [
    { key: `activation-mail:email:${emailKey(email)}`, max: policy.dispatchEmailMax, windowMs: 3600000, cooldownMs: policy.resendCooldownMs },
    { key: `activation-mail:ip:${emailKey(ip)}`, max: policy.dispatchIpMax, windowMs: 900000 }
  ];
  function requestLimit(purpose, view) {
    return asyncRoute(async (req, res, next) => {
      const email = normalizeEmail(req.body?.email), ip = req.ip || req.socket.remoteAddress;
      const specs = purpose === 'resend' ? dispatchSpecs(email, ip) : [
        { key: `${purpose}:email:${emailKey(email)}`, max: purpose === 'register' ? policy.registerEmailMax : policy.activateEmailMax, windowMs: purpose === 'register' ? 900000 : 60000 },
        { key: `${purpose}:ip:${emailKey(ip)}`, max: purpose === 'register' ? policy.registerIpMax : policy.activateIpMax, windowMs: purpose === 'register' ? 900000 : 60000 }
      ];
      const retry = await prisma.$transaction(tx => consumeBuckets(tx, specs, clock()));
      if (retry) return limited(res, view, email, retry);
      next();
    });
  }
  async function lockedUser(tx, email) {
    // Caller already holds the SQLite writer reservation.
    return tx.user.findUnique({ where: { email } });
  }
  async function mirror(tx, user, attempt) {
    if (user) await tx.activationChallenge.updateMany({ where: { userId: user.id }, data: { attempts: attempt.attempts, lockedUntil: attempt.lockedUntil } });
  }
  async function issue(req, input, isRegistration) {
    for (let tries = 0; ; tries++) {
      try {
        return await prisma.$transaction(async tx => {
          const attempt = await lockActivationAttempt(tx, input.email, clock), now = clock();
          if (attempt.lockedUntil > now) return { retry: retrySeconds(attempt.lockedUntil, now) };
          if (isRegistration) {
            const retry = await consumeBuckets(tx, dispatchSpecs(input.email, req.ip || req.socket.remoteAddress), now);
            if (retry) return { retry };
          }
          // Equal work for new/pending/active emails, after all security gates.
          let otp = generateOtp();
          let otpHash = await hashOtp(otp);
          const passwordHash = isRegistration ? await hashPassword(input.password) : null;
          let user = await lockedUser(tx, input.email);
          if (!user && isRegistration) user = await tx.user.create({ data: {
            email: input.email, emailOriginal: input.emailOriginal, passwordHash, role: 'viewer', status: 'pending'
          } });
          const previous = user ? await tx.activationChallenge.findUnique({ where: { userId: user.id } }) : null;
          // Even a rare CSPRNG collision must not make the immediately previous OTP valid again.
          // Run the same expensive comparison for unknown/active/new addresses.
          let repeated = await verifyOtp(otp, previous?.otpHash || otpHash);
          while (previous && repeated) {
            otp = generateOtp(); otpHash = await hashOtp(otp);
            repeated = await verifyOtp(otp, previous.otpHash);
          }
          await mirror(tx, user, attempt);
          if (!user || user.status !== 'pending' || user.emailVerifiedAt) return {};
          const issuedAt = clock();
          const challenge = { purpose: 'activation', otpHash, expiresAt: new Date(issuedAt.getTime() + policy.otpTtlMs),
            lastSentAt: issuedAt, usedAt: null, attempts: attempt.attempts, lockedUntil: attempt.lockedUntil };
          await tx.activationChallenge.upsert({ where: { userId: user.id },
            create: { userId: user.id, ...challenge }, update: challenge });
          return { mail: { to: user.emailOriginal || user.email, otp, expiresMinutes: policy.otpTtlMs / 60000 } };
        }, { maxWait: 10000, timeout: 15000 });
      } catch (error) {
        // A unique-email race with another writer rolls back before retrying.
        if (error.code !== 'P2002' || tries >= 1) throw error;
      }
    }
  }
  function finishIssue(res, outcome, email) {
    if (outcome.retry) return limited(res, 'activate', email, outcome.retry);
    if (outcome.mail) dispatchActivationAfterResponse(res, mailer, outcome.mail, logger);
    return render(res, 'activate', { email, notice: GENERIC_NOTICE });
  }

  router.get('/register', (_req, res) => render(res, 'register'));
  router.get('/activate', (req, res) => render(res, 'activate', { email: typeof req.query.email === 'string' ? req.query.email : '' }));
  router.post('/register', requestLimit('register', 'register'), requireCsrf, asyncRoute(async (req, res) => {
    const input = validateRegistrationInput(req.body);
    if (Object.keys(input.errors).length) return render(res, 'register', { email: input.values.email, errors: input.errors, code: 'VALIDATION_FAILED' });
    const captcha = await recaptchaVerifier.verifyToken(req.body['g-recaptcha-response'], req.ip, 'register');
    if (!captcha.ok) {
      const technical = ['not-configured', 'network-error', 'provider-error'].includes(captcha.reason);
      return render(res, 'register', { status: technical ? 500 : 200, email: input.values.email,
        code: technical ? 'CAPTCHA_PROVIDER_ERROR' : 'CAPTCHA_INVALID', errors: { form: 'Không thể xác minh CAPTCHA. Vui lòng thử lại.' } });
    }
    return finishIssue(res, await issue(req, input, true), input.values.email);
  }));
  router.post('/activate/resend', requestLimit('resend', 'activate'), requireCsrf, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!validEmail(email)) return render(res, 'activate', { email, code: 'VALIDATION_FAILED', errors: { email: 'Email không hợp lệ.' } });
    return finishIssue(res, await issue(req, { email }, false), email);
  }));
  router.post('/activate', requestLimit('activate', 'activate'), requireCsrf, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const outcome = await prisma.$transaction(async tx => {
      let attempt = await lockActivationAttempt(tx, email, clock);
      let now = clock();
      if (attempt.lockedUntil > now) return { retry: retrySeconds(attempt.lockedUntil, now) };
      const user = await lockedUser(tx, email);
      const challenge = user ? await tx.activationChallenge.findUnique({ where: { userId: user.id } }) : null;
      // Time-sensitive checks happen after all potentially blocking database locks.
      now = clock();
      await mirror(tx, user, attempt);
      const eligible = user?.status === 'pending' && !user.emailVerifiedAt && challenge?.purpose === 'activation'
        && !challenge.usedAt && challenge.expiresAt > now;
      const matches = eligible && await verifyOtp(req.body.otp, challenge.otpHash);
      now = clock();
      if (matches && challenge.expiresAt > now) {
        const claim = await tx.activationChallenge.updateMany({ where: {
          userId: user.id, purpose: 'activation', otpHash: challenge.otpHash, usedAt: null, expiresAt: { gt: now }
        }, data: { usedAt: now } });
        if (claim.count !== 1) throw new Error('Activation claim conflict');
        await tx.user.update({ where: { id: user.id }, data: { status: 'active', emailVerifiedAt: now } });
        return { activated: true };
      }
      const attempts = attempt.attempts + 1;
      attempt = await tx.activationAttempt.update({ where: { emailKey: attempt.emailKey }, data: {
        attempts, lockedUntil: attempts >= policy.otpMaxAttempts ? new Date(now.getTime() + policy.otpLockMs) : null
      } });
      await mirror(tx, user, attempt);
      return attempt.lockedUntil ? { retry: retrySeconds(attempt.lockedUntil, now) } : {};
    }, { maxWait: 10000, timeout: 15000 });
    if (outcome.retry) return limited(res, 'activate', email, outcome.retry);
    if (outcome.activated) return render(res, 'activate', { email, activated: true, notice: 'Kích hoạt thành công. Bạn có thể đăng nhập bằng mật khẩu đã đăng ký.' });
    return render(res, 'activate', { email, code: 'INVALID_OTP', errors: { form: 'Mã kích hoạt không hợp lệ hoặc đã hết hạn.' } });
  }));
  return router;
}
module.exports = { validateRegistrationInput, createRegistrationRouter, createSmtpMailer, GENERIC_NOTICE };
