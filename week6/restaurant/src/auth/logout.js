const express = require('express');
const { createRecaptchaV2Verifier } = require('./recaptcha-v2');

function createLogoutRecaptchaFromEnv(env = process.env, fetchImpl = globalThis.fetch) {
  const production = env.NODE_ENV === 'production';
  if (production && !env.APP_BASE_URL) throw new Error('APP_BASE_URL is required in production.');
  const base = new URL(env.APP_BASE_URL || `http://localhost:${env.PORT || 3001}`);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
    || base.pathname !== '/' || base.search || base.hash || (production && base.protocol !== 'https:')) {
    throw new Error('APP_BASE_URL must be an application origin (HTTPS in production).');
  }
  return createRecaptchaV2Verifier({
    siteKey: env.LOGOUT_RECAPTCHA_V2_SITE_KEY || '',
    secretKey: env.LOGOUT_RECAPTCHA_V2_SECRET_KEY || '',
    expectedHostname: base.hostname,
    fetchImpl
  });
}

// Uses the same persistent session, CSRF and cookie helpers as login.
function createLogoutRouter({
  prisma, requireLogin, requireCsrf, clearSessionCookie, authConfig,
  recaptchaVerifier = createLogoutRecaptchaFromEnv()
} = {}) {
  if (typeof prisma?.session?.deleteMany !== 'function'
    || [requireLogin, requireCsrf, clearSessionCookie].some((fn) => typeof fn !== 'function')
    || !authConfig || typeof recaptchaVerifier?.verify !== 'function'
    || typeof recaptchaVerifier?.isConfigured !== 'function') {
    throw new TypeError('Logout requires the persistent session store and shared login/CSRF/cookie helpers.');
  }

  const router = express.Router();
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const privateResponse = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  };
  const showForm = (req, res, status = 200, message = '') => {
    const configured = recaptchaVerifier.isConfigured();
    if (!configured) {
      status = 500;
      message = 'Chưa thể xác minh thao tác. Vui lòng thử lại sau.';
    }
    return res.status(status).render('auth/logout', {
      title: 'Đăng xuất',
      email: req.auth.user.email,
      csrfToken: res.locals.csrfToken,
      recaptchaSiteKey: configured ? recaptchaVerifier.siteKey : '',
      captchaConfigured: configured,
      message
    });
  };

  // A read-only confirmation page; GET /logout itself remains unregistered.
  router.get('/logout/confirm', privateResponse, requireLogin, (req, res) => showForm(req, res));
  router.post('/logout', privateResponse, requireLogin, requireCsrf, asyncRoute(async (req, res) => {
    const session = req.auth?.session;
    const user = req.auth?.user;
    if (!user || session?.userId !== user.id || !/^[0-9a-f]{64}$/.test(session?.sidHash || '')) {
      throw new Error('Authenticated logout session is missing or inconsistent.');
    }

    const proof = await recaptchaVerifier.verify(req.body['g-recaptcha-response']);
    if (!proof.ok) {
      return showForm(req, res, proof.reason === 'unavailable' ? 500 : 200,
        proof.reason === 'unavailable'
          ? 'Chưa thể xác minh thao tác. Vui lòng thử lại sau.'
          : 'Vui lòng xác nhận reCAPTCHA rồi thử lại.');
    }

    // Restrict deletion to this exact session; never revoke all user sessions.
    // Await the store before clearing the cookie or sending a success redirect.
    await prisma.session.deleteMany({ where: { sidHash: session.sidHash, userId: user.id } });
    clearSessionCookie(res, authConfig);
    return res.redirect(303, '/login');
  }));
  return router;
}

module.exports = { createLogoutRouter, createLogoutRecaptchaFromEnv };
