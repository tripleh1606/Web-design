const express = require('express');
const { normalizeEmail, validateEmail, hashPassword, verifyPassword, generateOtp, hashToken } = require('./credentials');
const { requireCsrf } = require('./session');
const { lock, consume } = require('./throttle');
const { createSmtpMailer } = require('./mail');

const MINUTE = 60_000;
const GENERIC_NOTICE = 'Nếu tài khoản cần kích hoạt, mã OTP sẽ được gửi qua email. Vui lòng kiểm tra hộp thư.';
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
let dummyOtpHash;

function validateRegistrationInput(body = {}) {
  const original = typeof body.email === 'string' ? body.email.trim() : '';
  const email = normalizeEmail(original);
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};
  if (!validateEmail(email)) errors.email = 'Email không hợp lệ.';
  if (password.length < 8 || password.length > 128) errors.password = 'Mật khẩu phải có từ 8 đến 128 ký tự.';
  if (body.confirmPassword !== password) errors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
  return { values: { email: original.slice(0, 254) }, email, emailOriginal: original, password, errors };
}

function createRegistrationRouter({ prisma, mailer = createSmtpMailer(), recaptchaVerifier, authConfig, logger = console }) {
  const router = express.Router();
  const registerPage = (res, status, values, errors = {}, code = '') => res.status(status).render('auth/register', {
    title: 'Đăng ký', values, errors, code, recaptchaSiteKey: authConfig.recaptchaSiteKey
  });
  const activationPage = (res, status, email, { code = '', notice = '', activated = false } = {}) => res.status(status).render('auth/activate', {
    title: 'Kích hoạt tài khoản', values: { email: email.slice(0, 254) }, code, notice, activated
  });
  const limitPage = (res, retryAfter, email, registration = false) => {
    res.set('Retry-After', String(Math.max(1, retryAfter || 1)));
    return registration
      ? registerPage(res, 429, { email }, { form: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }, 'RATE_LIMITED')
      : activationPage(res, 429, email, { code: 'RATE_LIMITED', notice: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' });
  };

  // Keep a budget for every email/IP, including unknown and already active accounts.
  const requestBudget = (purpose, emailLimit, ipLimit, windowMs) => asyncRoute(async (req, res, next) => {
    const email = normalizeEmail(req.body?.email).slice(0, 254);
    const result = await prisma.$transaction(async tx => {
      const ip = await consume(tx, { key: `${purpose}:ip:${hashToken(req.ip || 'unknown')}`, limit: ipLimit, windowMs });
      if (!ip.allowed) return ip;
      return consume(tx, { key: `${purpose}:email:${hashToken(email)}`, limit: emailLimit, windowMs });
    });
    if (!result.allowed) return limitPage(res, result.retryAfter, email, purpose === 'register');
    next();
  });

  async function activationState(tx, email) {
    const emailKey = hashToken(email);
    await lock(tx, `activation:${emailKey}`);
    let attempt = await tx.activationAttempt.findUnique({ where: { emailKey } });
    if (!attempt) attempt = await tx.activationAttempt.create({ data: { emailKey, attempts: 0 } });
    let user = await tx.user.findUnique({ where: { email } });
    if (user) {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      user = await tx.user.findUnique({ where: { id: user.id } });
    }
    // A transaction can wait for a user lock. Expiry/lock decisions must use the time after that wait.
    const now = new Date();
    const unlocked = attempt.lockedUntil && attempt.lockedUntil <= now;
    if (unlocked) {
      attempt = await tx.activationAttempt.update({ where: { emailKey }, data: { attempts: 0, lockedUntil: null } });
      if (user) await tx.activationChallenge.updateMany({ where: { userId: user.id }, data: { attempts: 0, lockedUntil: null } });
    }
    return { emailKey, attempt, user, now };
  }

  function queueMail(res, message) {
    if (!message) return;
    res.once('finish', () => {
      setImmediate(() => Promise.resolve().then(() => mailer.sendActivationOtp(message)).catch(() => {
        logger.error('Activation email delivery failed', 'SMTP_DELIVERY_FAILED');
      }));
    });
  }

  async function dispatch(tx, state, req, registration) {
    const { user, attempt } = state;
    const ipKey = `activation-send:ip:${hashToken(req.ip || 'unknown')}`;
    const emailKey = `activation-send:email:${state.emailKey}`;
    // Acquire potentially contended quota locks before fixing the dispatch time.
    await lock(tx, `rate:${ipKey}`);
    await lock(tx, `rate:${emailKey}`);
    const now = new Date();
    if (attempt.lockedUntil && attempt.lockedUntil > now) {
      return { allowed: false, retryAfter: Math.ceil((attempt.lockedUntil - now) / 1000) };
    }
    const ipBudget = await consume(tx, { key: ipKey, limit: 20, windowMs: 15 * MINUTE });
    if (!ipBudget.allowed) return ipBudget;
    const emailBudget = await consume(tx, { key: emailKey, limit: 5, windowMs: 60 * MINUTE, cooldownMs: MINUTE });
    if (!emailBudget.allowed) return emailBudget;

    // Do equivalent hashing work before branching on existence. Never replace pending credentials.
    const otp = generateOtp();
    const otpHash = await hashPassword(otp);
    const passwordHash = registration ? await hashPassword(registration.password) : null;
    const issuedAt = new Date();
    await tx.rateLimitBucket.update({ where: { key: emailKey }, data: { nextAllowedAt: new Date(issuedAt.getTime() + MINUTE) } });
    let pending = user;
    if (!pending && registration) {
      pending = await tx.user.create({ data: {
        email: registration.email, emailOriginal: registration.emailOriginal, passwordHash,
        role: 'viewer', status: 'pending', emailVerifiedAt: null
      } });
    }
    if (pending?.status !== 'pending') return { allowed: true };
    const data = {
      purpose: 'activation', otpHash, expiresAt: new Date(issuedAt.getTime() + 10 * MINUTE),
      attempts: attempt.attempts, lockedUntil: attempt.lockedUntil || null, lastSentAt: issuedAt, usedAt: null
    };
    await tx.activationChallenge.upsert({ where: { userId: pending.id }, create: { userId: pending.id, ...data }, update: data });
    return { allowed: true, mail: { to: pending.emailOriginal || pending.email, otp } };
  }

  router.get('/register', (req, res) => req.auth.user
    ? res.redirect(303, '/admin/dishes') : registerPage(res, 200, { email: '' }));

  router.post('/register', requestBudget('register', 5, 20, 15 * MINUTE), requireCsrf, asyncRoute(async (req, res) => {
    const input = validateRegistrationInput(req.body);
    if (Object.keys(input.errors).length) return registerPage(res, 200, input.values, input.errors, 'VALIDATION_FAILED');
    const locked = await prisma.$transaction(async tx => {
      const state = await activationState(tx, input.email);
      return state.attempt.lockedUntil > state.now ? Math.ceil((state.attempt.lockedUntil - state.now) / 1000) : 0;
    });
    if (locked) return limitPage(res, locked, input.values.email, true);
    const captcha = await recaptchaVerifier.verify(req.body['g-recaptcha-response'], 'register');
    if (!captcha.ok) return registerPage(res, captcha.reason === 'unavailable' ? 500 : 200, input.values,
      { form: 'Không thể xác minh reCAPTCHA. Vui lòng thử lại.' }, captcha.reason === 'unavailable' ? 'PROVIDER_UNAVAILABLE' : 'INVALID_CAPTCHA');
    if (!mailer.isConfigured()) return registerPage(res, 500, input.values, { form: 'Dịch vụ email chưa sẵn sàng.' }, 'PROVIDER_UNAVAILABLE');
    const outcome = await prisma.$transaction(async tx => dispatch(tx, await activationState(tx, input.email), req, input), { timeout: 15000 });
    if (!outcome.allowed) return limitPage(res, outcome.retryAfter, input.values.email, true);
    queueMail(res, outcome.mail);
    return activationPage(res, 200, input.values.email, { notice: GENERIC_NOTICE });
  }));

  router.get('/activate', (req, res) => activationPage(res, 200, typeof req.query.email === 'string' ? req.query.email : ''));

  router.post('/activate/resend', requestBudget('resend', 20, 20, 15 * MINUTE), requireCsrf, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!validateEmail(email)) return activationPage(res, 200, email, { code: 'VALIDATION_FAILED', notice: 'Email không hợp lệ.' });
    if (!mailer.isConfigured()) return activationPage(res, 500, email, { code: 'PROVIDER_UNAVAILABLE', notice: 'Dịch vụ email chưa sẵn sàng.' });
    const outcome = await prisma.$transaction(async tx => dispatch(tx, await activationState(tx, email), req), { timeout: 15000 });
    if (!outcome.allowed) return limitPage(res, outcome.retryAfter, email);
    queueMail(res, outcome.mail);
    return activationPage(res, 200, email, { notice: GENERIC_NOTICE });
  }));

  router.post('/activate', requestBudget('activate', 10, 30, MINUTE), requireCsrf, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const otp = typeof req.body.otp === 'string' ? req.body.otp : '';
    const outcome = await prisma.$transaction(async tx => {
      const { attempt, user, emailKey } = await activationState(tx, email);
      let now = new Date();
      if (attempt.lockedUntil > now) return { locked: true, retryAfter: Math.ceil((attempt.lockedUntil - now) / 1000) };
      const challenge = user ? await tx.activationChallenge.findUnique({ where: { userId: user.id } }) : null;
      let candidateHash = challenge?.otpHash;
      if (!candidateHash) {
        dummyOtpHash ||= hashPassword('000000');
        candidateHash = await dummyOtpHash;
      }
      const matching = await verifyPassword(/^\d{6}$/.test(otp) ? otp : 'invalid-otp', candidateHash);
      now = new Date();
      const valid = user?.status === 'pending' && challenge?.purpose === 'activation'
        && challenge.expiresAt > now && !challenge.usedAt && attempt.attempts < 5 && matching;
      if (valid) {
        const claim = await tx.activationChallenge.updateMany({
          where: { userId: user.id, purpose: 'activation', usedAt: null, expiresAt: { gt: now }, attempts: { lt: 5 } },
          data: { usedAt: now }
        });
        if (claim.count === 1) {
          await tx.user.update({ where: { id: user.id }, data: { status: 'active', emailVerifiedAt: now } });
          return { activated: true };
        }
      }
      const attempts = attempt.attempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(now.getTime() + 15 * MINUTE) : null;
      await tx.activationAttempt.update({ where: { emailKey }, data: { attempts, lockedUntil } });
      if (challenge) await tx.activationChallenge.update({ where: { userId: user.id }, data: { attempts, lockedUntil } });
      return { activated: false, locked: Boolean(lockedUntil), retryAfter: 15 * 60 };
    }, { timeout: 15000 });
    if (outcome.locked) return limitPage(res, outcome.retryAfter, email);
    return activationPage(res, 200, email, outcome.activated
      ? { activated: true, notice: 'Tài khoản đã được kích hoạt. Vui lòng đăng nhập.' }
      : { code: 'INVALID_OTP', notice: 'Mã OTP không hợp lệ hoặc đã hết hạn.' });
  }));
  return router;
}

module.exports = { validateRegistrationInput, createRegistrationRouter, createSmtpMailer };
