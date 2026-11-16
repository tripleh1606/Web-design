const express = require('express');
const { createAccessTokens } = require('./access-token');
const { createAdminRouter } = require('./admin');
const { capabilities } = require('./policy');
const { createRecaptchaVerifier } = require('./captcha');
const { resolveAuthConfig } = require('./config');
const { createLoginRouter } = require('./login');
const { createSmtpMailer } = require('./mail');
const { createPasswordResetRouter } = require('./password-reset');
const { createRegistrationRouter } = require('./registration');
const { ok } = require('./response');
const { createThrottle } = require('./throttle');

function mountAuth(app, {
  prisma, spaOrigin, provider, logger, jwtSecret = process.env.JWT_ACCESS_SECRET,
  mailer = createSmtpMailer(), recaptchaVerifier
}) {
  const accessTokens = createAccessTokens(jwtSecret, prisma);
  const authConfig = resolveAuthConfig({ appBaseUrl: spaOrigin });
  const captcha = recaptchaVerifier || createRecaptchaVerifier(authConfig);
  const throttle = createThrottle(provider);
  const options = { prisma, authConfig, throttle, logger, mailer, recaptchaVerifier: captcha, accessTokens };
  const router = express.Router();
  router.get('/config', (_req, res) => ok(res, {
    recaptchaSiteKey: captcha.isConfigured() ? captcha.siteKey : ''
  }));
  router.use(createRegistrationRouter(options));
  router.use(createLoginRouter(options));
  router.use(createPasswordResetRouter(options));
  router.get('/me', accessTokens.requireAccessToken, (req, res) => ok(res, {
    user: { id: req.auth.userId, role: req.auth.role, chefId: req.auth.chefId },
    capabilities: capabilities(req.auth.role)
  }));
  router.post('/logout', accessTokens.requireAccessToken, (_req, res) => {
    // The SPA discards its token. Copies remain valid until they expire.
    return ok(res, { notice: 'Bạn đã đăng xuất.' });
  });
  app.use('/api/auth', router);
  app.use('/api', accessTokens.requireAccessToken);
  app.use('/api', createAdminRouter({ prisma, provider, logger }));
}

module.exports = { mountAuth };
