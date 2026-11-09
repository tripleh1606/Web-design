const MINUTE = 60_000;
const POLICY = Object.freeze({
  otpTtlMs: 10 * MINUTE, otpMaxAttempts: 5, otpLockMs: 15 * MINUTE,
  resendCooldownMs: MINUTE, resendEmailLimit: 5, resendWindowMs: 60 * MINUTE,
  registerEmailLimit: 5, registerIpLimit: 20, registerWindowMs: 15 * MINUTE,
  activateEmailLimit: 10, activateIpLimit: 30, activateWindowMs: MINUTE,
  loginWindowMs: 15 * MINUTE, loginCaptchaThreshold: 3, loginLockThreshold: 10,
  loginLockMs: 5 * MINUTE, loginIpLimit: 50
});
function resolveAuthConfig(overrides = {}, env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origin = overrides.appBaseUrl ?? env.APP_BASE_URL ?? `http://localhost:${env.PORT || 3001}`;
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (production && (url.protocol !== 'https:' || (!env.APP_BASE_URL && !overrides.appBaseUrl)))) throw new Error('Invalid APP_BASE_URL');
  const duration = (key, msName, fallback, unitName, scale = 1) => {
    const positiveInteger = (value, name) => {
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
      return value;
    };
    if (overrides[key] !== undefined) return positiveInteger(overrides[key], key);
    const milliseconds = env[msName] === undefined ? undefined : positiveInteger(Number(env[msName]), msName);
    const units = !unitName || env[unitName] === undefined ? undefined : positiveInteger(Number(env[unitName]), unitName);
    const converted = units === undefined ? undefined : positiveInteger(units * scale, unitName);
    // Keep existing millisecond configs working, but never silently choose
    // between contradictory values supplied under the two supported names.
    if (milliseconds !== undefined && converted !== undefined && milliseconds !== converted) {
      throw new Error(`Conflicting ${unitName} and ${msName}`);
    }
    return converted ?? milliseconds ?? fallback;
  };
  // Accept the legacy Week 6 key names when neither dedicated auth key is set.
  const hasAuthV2Key = Boolean(env.RECAPTCHA_V2_SITE_KEY || env.RECAPTCHA_V2_SECRET_KEY);
  const v2SiteKey = hasAuthV2Key ? env.RECAPTCHA_V2_SITE_KEY : env.LOGOUT_RECAPTCHA_V2_SITE_KEY;
  const v2SecretKey = hasAuthV2Key ? env.RECAPTCHA_V2_SECRET_KEY : env.LOGOUT_RECAPTCHA_V2_SECRET_KEY;
  return {
    appBaseUrl: url.origin,
    // Only used by the legacy cookie-session cleanup command.
    sessionIdleMs: duration('sessionIdleMs', 'SESSION_IDLE_MS', 30 * MINUTE, 'SESSION_IDLE_MINUTES', MINUTE),
    recaptchaSiteKey: overrides.recaptchaSiteKey ?? v2SiteKey ?? '',
    recaptchaSecretKey: overrides.recaptchaSecretKey ?? v2SecretKey ?? '',
    ...POLICY
  };
}
module.exports = { resolveAuthConfig, POLICY };
