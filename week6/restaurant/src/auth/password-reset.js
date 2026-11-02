const { lockDatabaseWrite } = require('./database-lock');
const express = require('express');
const { validEmail } = require('./credentials');
const {
  normalizeEmail,
  hashPassword,
  generateRawToken,
  hashToken,
  requireCsrf,
  clearSessionCookie
} = require('./session');

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const TOKEN_REGEX = /^[a-f0-9]{64}$/;

function getClientIp(req) {
  const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
  return typeof rawIp === 'string' ? rawIp.replace(/^::ffff:/, '') : 'unknown';
}

// In-memory fallback rate-limiter when DB model is not available
const inMemoryLimits = new Map();

async function checkRateLimit(prisma, key, maxRequests, windowMs) {
  const now = new Date();
  if (prisma && prisma.passwordResetLimit) {
    return await prisma.$transaction(async tx => {
      await lockDatabaseWrite(tx);
      const row = await tx.passwordResetLimit.findUnique({ where: { key } });
      if (!row || (now.getTime() - new Date(row.windowStart).getTime()) >= windowMs) {
        await tx.passwordResetLimit.upsert({
          where: { key },
          create: { key, count: 1, windowStart: now },
          update: { count: 1, windowStart: now }
        });
        return { allowed: true, retryAfter: 0 };
      }
      if (row.count >= maxRequests) {
        const remainingMs = windowMs - (now.getTime() - new Date(row.windowStart).getTime());
        const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
        return { allowed: false, retryAfter };
      }
      await tx.passwordResetLimit.update({
        where: { key },
        data: { count: { increment: 1 } }
      });
      return { allowed: true, retryAfter: 0 };
    });
  }

  // Fallback in-memory
  const entry = inMemoryLimits.get(key);
  if (!entry || (now.getTime() - entry.windowStart.getTime()) >= windowMs) {
    inMemoryLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfter: 0 };
  }
  if (entry.count >= maxRequests) {
    const remainingMs = windowMs - (now.getTime() - entry.windowStart.getTime());
    const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
    return { allowed: false, retryAfter };
  }
  entry.count++;
  return { allowed: true, retryAfter: 0 };
}

function validateResetInput(body) {
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  const errors = {};
  if (password.length < 8 || password.length > 128) {
    errors.password = 'Mật khẩu phải có từ 8 đến 128 ký tự.';
  }
  if (confirmPassword !== password) {
    errors.confirmPassword = 'Mật khẩu xác nhận không khớp.';
  }
  return { errors, password };
}

function createPasswordResetRouter({ prisma, mailer, authConfig, logger = console }) {
  const router = express.Router();

  const setSecurityHeaders = (res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
  };

  const renderForgot = (res, status, email = '', errors = {}, notice = '') => {
    setSecurityHeaders(res);
    return res.status(status).render('auth/forgot', {
      title: 'Quên mật khẩu',
      values: { email },
      errors,
      notice
    });
  };

  const renderReset = (res, status, { invalid = false, token = '', errors = {} } = {}) => {
    setSecurityHeaders(res);
    return res.status(status).render('auth/reset', {
      title: invalid ? 'Liên kết không hợp lệ' : 'Đặt lại mật khẩu',
      invalid,
      token,
      errors
    });
  };

  // GET /forgot
  router.get(['/forgot', '/auth/forgot'], (req, res) => {
    if (req.auth?.user) return res.redirect(302, '/admin/dishes');
    return renderForgot(res, 200);
  });

  // POST /forgot
  router.post(['/forgot', '/auth/forgot'], requireCsrf, asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const ip = getClientIp(req);

    // 1. Check IP rate limit (20 requests / 15 minutes)
    const ipLimit = await checkRateLimit(prisma, `forgot-ip:${ip}`, 20, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      res.set('Retry-After', String(ipLimit.retryAfter));
      return renderForgot(res, 429, email, { form: 'Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau.' });
    }

    // 2. Check email rate limit (3 requests / 15 minutes) - applies to both existing and nonexistent emails
    const emailLimitKey = email || `invalid:${ip}`;
    const emailLimit = await checkRateLimit(prisma, `forgot-email:${emailLimitKey}`, 3, 15 * 60 * 1000);
    if (!emailLimit.allowed) {
      res.set('Retry-After', String(emailLimit.retryAfter));
      return renderForgot(res, 429, email, { form: 'Quá nhiều yêu cầu cho email này. Vui lòng thử lại sau.' });
    }

    // 3. Validate email format
    if (!validEmail(email)) {
      return renderForgot(res, 400, email.slice(0, 254), { email: 'Email không hợp lệ.' });
    }

    // 4. Look up user
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lifetime

      await prisma.$transaction(async tx => {
        await lockDatabaseWrite(tx);

        // Invalidate all prior unused tokens for this user
        await tx.passwordReset.updateMany({
          where: {
            userId: user.id,
            usedAt: null,
            invalidatedAt: null
          },
          data: { invalidatedAt: new Date() }
        });

        // Insert fresh token
        await tx.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt
          }
        });
      });

      // Dispatch email asynchronously after response commit; never return raw token in HTTP response or log it
      const resetUrl = `${authConfig.appBaseUrl}/auth/reset?token=${rawToken}`;
      setImmediate(async () => {
        try {
          if (mailer && typeof mailer.sendPasswordResetEmail === 'function') {
            await mailer.sendPasswordResetEmail({ to: user.email, resetUrl });
          }
        } catch (err) {
          logger.error('Failed to send password reset email:', err);
        }
      });
    } else {
      // Dummy crypto work to equalize response timing between existing and nonexistent email
      hashToken(generateRawToken());
    }

    // Identical generic 200 response regardless of account existence
    return renderForgot(
      res,
      200,
      email,
      {},
      'Nếu email của bạn tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu.'
    );
  }));

  // GET /reset?token=...
  router.get(['/reset', '/auth/reset'], asyncRoute(async (req, res) => {
    const ip = getClientIp(req);

    // Shared IP quota (20 requests / 15 minutes) before token lookup
    const ipLimit = await checkRateLimit(prisma, `reset-ip:${ip}`, 20, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      res.set('Retry-After', String(ipLimit.retryAfter));
      return res.status(429).render('error', {
        title: 'Quá nhiều yêu cầu',
        status: 429,
        message: 'Quá nhiều yêu cầu đặt lại mật khẩu từ địa chỉ này. Vui lòng thử lại sau.',
        back: '/dishes'
      });
    }

    const rawToken = req.query.token;
    if (typeof rawToken !== 'string' || !TOKEN_REGEX.test(rawToken)) {
      return renderReset(res, 200, { invalid: true });
    }

    const tokenRecord = await prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(rawToken) }
    });

    const now = new Date();
    if (!tokenRecord || tokenRecord.usedAt !== null || tokenRecord.invalidatedAt !== null || tokenRecord.expiresAt <= now) {
      return renderReset(res, 200, { invalid: true });
    }

    // Valid token: render form without consuming token
    return renderReset(res, 200, { invalid: false, token: rawToken });
  }));

  // POST /reset
  router.post(['/reset', '/auth/reset'], requireCsrf, asyncRoute(async (req, res) => {
    const ip = getClientIp(req);

    // Shared IP quota with GET /reset
    const ipLimit = await checkRateLimit(prisma, `reset-ip:${ip}`, 20, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      res.set('Retry-After', String(ipLimit.retryAfter));
      return res.status(429).render('error', {
        title: 'Quá nhiều yêu cầu',
        status: 429,
        message: 'Quá nhiều yêu cầu đặt lại mật khẩu từ địa chỉ này. Vui lòng thử lại sau.',
        back: '/dishes'
      });
    }

    const rawToken = req.body.token || req.query.token;
    if (typeof rawToken !== 'string' || !TOKEN_REGEX.test(rawToken)) {
      return renderReset(res, 200, { invalid: true });
    }

    const { errors, password } = validateResetInput(req.body);
    if (Object.keys(errors).length > 0) {
      return renderReset(res, 400, { invalid: false, token: rawToken, errors });
    }

    const outcome = await prisma.$transaction(async tx => {
      await lockDatabaseWrite(tx);
      const now = new Date();
      const tokenRecord = await tx.passwordReset.findUnique({
        where: { tokenHash: hashToken(rawToken) }
      });

      if (!tokenRecord || tokenRecord.usedAt !== null || tokenRecord.invalidatedAt !== null || tokenRecord.expiresAt <= now) {
        return { invalid: true };
      }

      const user = await tx.user.findUnique({ where: { id: tokenRecord.userId } });
      if (!user) return { invalid: true };

      // Conditionally claim the token
      const claim = await tx.passwordReset.updateMany({
        where: {
          id: tokenRecord.id,
          usedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: now }
        },
        data: { usedAt: now }
      });

      if (claim.count !== 1) {
        return { invalid: true };
      }

      // Update password hash (preserve emailVerifiedAt, role, etc. Pending stays pending)
      const passwordHash = await hashPassword(password);
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash }
      });

      // Invalidate all other unused reset tokens for this user
      await tx.passwordReset.updateMany({
        where: {
          userId: user.id,
          id: { not: tokenRecord.id },
          usedAt: null,
          invalidatedAt: null
        },
        data: { invalidatedAt: now }
      });

      // Revoke all sessions for this user
      await tx.session.deleteMany({
        where: { userId: user.id }
      });

      return { ok: true, user };
    });

    if (outcome.invalid) {
      return renderReset(res, 200, { invalid: true });
    }

    // If current browser session belongs to this user, clear cookie
    if (req.auth?.user?.id === outcome.user.id) {
      clearSessionCookie(res, authConfig);
    }

    // Send password changed notification asynchronously
    setImmediate(async () => {
      try {
        if (mailer && typeof mailer.sendPasswordChangedNotice === 'function') {
          await mailer.sendPasswordChangedNotice({ to: outcome.user.email });
        }
      } catch (err) {
        logger.error('Failed to send password changed notice:', err);
      }
    });

    // 303 redirect to login; no automatic login
    return res.redirect(303, '/auth/login?reset=1');
  }));

  return router;
}

module.exports = {
  createPasswordResetRouter,
  validateResetInput,
  checkRateLimit
};
