const { createRecaptchaV2Verifier } = require('./recaptcha-v2');
const { resolveAuthConfig } = require('./config');

function createRecaptchaVerifier(config = process.env, fetchImpl = globalThis.fetch) {
  const resolved = config.appBaseUrl ? config : resolveAuthConfig({}, config);
  let hostname = '';
  try { hostname = new URL(resolved.appBaseUrl).hostname; } catch {}
  const verifier = createRecaptchaV2Verifier({
    siteKey: resolved.recaptchaSiteKey || '', secretKey: resolved.recaptchaSecretKey || '',
    expectedHostname: hostname, fetchImpl
  });
  return {
    siteKey: verifier.siteKey, isConfigured: verifier.isConfigured,
    async verify(token, purpose) {
      // This is server-selected routing context. Google v2 does not return an
      // action or score, and it does not attest which local form minted a token.
      if (!['register', 'login'].includes(purpose)) return { ok: false, reason: 'invalid' };
      return verifier.verify(token);
    }
  };
}
module.exports = { createRecaptchaVerifier };
