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
const { createMfaService } = require('./mfa-service');
const { createMfaRouter } = require('./mfa');

function mountAuth(app, {
  prisma, spaOrigin, provider, logger, jwtSecret = process.env.JWT_ACCESS_SECRET,
  mailer = createSmtpMailer(), recaptchaVerifier, mfaEncryptionKey = process.env.MFA_ENCRYPTION_KEY
}) {
  const accessTokens = createAccessTokens(jwtSecret, prisma);
  const authConfig = resolveAuthConfig({ appBaseUrl: spaOrigin });
  const captcha = recaptchaVerifier || createRecaptchaVerifier(authConfig);
  const throttle = createThrottle(provider);
  const mfa = createMfaService({ prisma, throttle, accessTokens, encryptionKey: mfaEncryptionKey });
  const options = { prisma, authConfig, throttle, logger, mailer, recaptchaVerifier: captcha, accessTokens, mfa };
  const router = express.Router();
  router.get('/config', (_req, res) => ok(res, {
    recaptchaSiteKey: captcha.isConfigured() ? captcha.siteKey : ''
  }));
  router.use(createRegistrationRouter(options));
  router.use(createLoginRouter(options));
  router.use(createPasswordResetRouter(options));
  router.use(createMfaRouter(options));
  router.get('/me', accessTokens.requireAccessToken, mfa.requireCurrent, (req, res) => ok(res, {
    user: { id: req.auth.userId, role: req.auth.role, chefId: req.auth.chefId },
    capabilities: capabilities(req.auth.role)
  }));
  router.post('/logout', accessTokens.requireAccessToken, mfa.requireCurrent, (_req, res) => {
    // The SPA discards its token. Copies remain valid until they expire.
    return ok(res, { notice: 'Bạn đã đăng xuất.' });
  });
  app.use('/api/auth', router);
  app.use('/api', accessTokens.requireAccessToken, mfa.requireCurrent);
  app.use('/api', createAdminRouter({ prisma, provider, logger }));
}

module.exports = { mountAuth };
