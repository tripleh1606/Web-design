const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAuthConfig } = require('../src/auth/config');

test('session configuration honors plan minute/hour variables and documented defaults', () => {
  const configured = resolveAuthConfig({}, { SESSION_IDLE_MINUTES: '1', SESSION_MAX_HOURS: '2' });
  assert.equal(configured.sessionIdleMs, 60_000);
  assert.equal(configured.sessionTtlMs, 7_200_000);
  const defaults = resolveAuthConfig({}, {});
  assert.equal(defaults.sessionIdleMs, 1_800_000);
  assert.equal(defaults.sessionTtlMs, 86_400_000);
  assert.equal(defaults.anonymousTtlMs, 1_800_000);
});

test('existing millisecond aliases work and matching duplicate settings are accepted', () => {
  const config = resolveAuthConfig({}, { SESSION_IDLE_MS: '60000', SESSION_TTL_MS: '7200000' });
  assert.equal(config.sessionIdleMs, 60_000);
  assert.equal(config.sessionTtlMs, 7_200_000);
  const matching = resolveAuthConfig({}, {
    SESSION_IDLE_MINUTES: '1', SESSION_IDLE_MS: '60000',
    SESSION_MAX_HOURS: '2', SESSION_TTL_MS: '7200000'
  });
  assert.equal(matching.sessionIdleMs, config.sessionIdleMs);
  assert.equal(matching.sessionTtlMs, config.sessionTtlMs);
});

test('contradictory aliases and invalid or overflowing durations fail before startup', () => {
  assert.throws(() => resolveAuthConfig({}, { SESSION_IDLE_MINUTES: '1', SESSION_IDLE_MS: '1800000' }), /Conflicting SESSION_IDLE_MINUTES/);
  assert.throws(() => resolveAuthConfig({}, { SESSION_MAX_HOURS: '2', SESSION_TTL_MS: '86400000' }), /Conflicting SESSION_MAX_HOURS/);
  for (const name of ['SESSION_IDLE_MINUTES', 'SESSION_MAX_HOURS', 'SESSION_IDLE_MS', 'SESSION_TTL_MS', 'ANONYMOUS_SESSION_TTL_MS']) {
    for (const invalid of ['', '0', '-1', '1.5', 'NaN', 'Infinity']) {
      assert.throws(() => resolveAuthConfig({}, { [name]: invalid }), /Invalid/, name);
    }
  }
  assert.throws(() => resolveAuthConfig({}, { SESSION_MAX_HOURS: String(Number.MAX_SAFE_INTEGER) }), /Invalid SESSION_MAX_HOURS/);
});

test('explicit test overrides remain milliseconds and do not weaken production cookie checks', () => {
  const config = resolveAuthConfig({ sessionIdleMs: 100, sessionTtlMs: 200 }, { SESSION_IDLE_MINUTES: '2', SESSION_MAX_HOURS: '2' });
  assert.equal(config.sessionIdleMs, 100); assert.equal(config.sessionTtlMs, 200);
  assert.throws(() => resolveAuthConfig({ sessionIdleMs: 0 }, {}), /Invalid sessionIdleMs/);
  assert.throws(() => resolveAuthConfig({ appBaseUrl: 'http://example.com' }, { NODE_ENV: 'production' }), /Invalid APP_BASE_URL/);
  assert.throws(() => resolveAuthConfig({ cookieSecure: false }, { NODE_ENV: 'production', APP_BASE_URL: 'https://example.com' }), /Secure cookies/);
});

test('v2 uses an explicit auth pair or the complete existing logout pair, never a v3 key', () => {
  const logout = { LOGOUT_RECAPTCHA_V2_SITE_KEY: 'logout-site', LOGOUT_RECAPTCHA_V2_SECRET_KEY: 'logout-secret' };
  const fallback = resolveAuthConfig({}, logout);
  assert.equal(fallback.recaptchaSiteKey, 'logout-site');
  assert.equal(fallback.recaptchaSecretKey, 'logout-secret');
  const explicit = resolveAuthConfig({}, { ...logout, RECAPTCHA_V2_SITE_KEY: 'auth-site', RECAPTCHA_V2_SECRET_KEY: 'auth-secret' });
  assert.equal(explicit.recaptchaSiteKey, 'auth-site');
  assert.equal(explicit.recaptchaSecretKey, 'auth-secret');
  const empty = resolveAuthConfig({}, { ...logout, RECAPTCHA_V2_SITE_KEY: '', RECAPTCHA_V2_SECRET_KEY: '' });
  assert.equal(empty.recaptchaSiteKey, 'logout-site');
  const v3 = resolveAuthConfig({}, { RECAPTCHA_V3_SITE_KEY: 'v3-site', RECAPTCHA_V3_SECRET_KEY: 'v3-secret' });
  assert.equal(v3.recaptchaSiteKey, ''); assert.equal(v3.recaptchaSecretKey, '');
});

test('a partially specified v2 auth pair cannot borrow a secret or site key from logout', () => {
  const { createRecaptchaVerifier } = require('../src/auth/captcha');
  const logout = { LOGOUT_RECAPTCHA_V2_SITE_KEY: 'logout-site', LOGOUT_RECAPTCHA_V2_SECRET_KEY: 'logout-secret' };
  for (const partial of [{ RECAPTCHA_V2_SITE_KEY: 'auth-site' }, { RECAPTCHA_V2_SECRET_KEY: 'auth-secret' }]) {
    const config = resolveAuthConfig({}, { ...logout, ...partial });
    const verifier = createRecaptchaVerifier(config, async () => { throw new Error('Must not call Google'); });
    assert.equal(verifier.isConfigured(), false);
  }
});
