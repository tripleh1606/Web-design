const express = require('express');
const { createAccessTokens } = require('./access-token');
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
  const accessTokens = createAccessTokens(jwtSecret);
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
  router.post('/logout', accessTokens.requireAccessToken, (_req, res) => {
    // The SPA discards its token. Copies remain valid until they expire.
    return ok(res, { notice: 'Bạn đã đăng xuất.' });
  });
  app.use('/api/auth', router);
  app.use('/api', accessTokens.requireAccessToken);
}

module.exports = { mountAuth };
