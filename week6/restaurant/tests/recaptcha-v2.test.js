const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRecaptchaV2Verifier } = require('../src/auth/recaptcha-v2');
const clock = Date.parse('2026-11-02T00:00:00Z');
const valid = () => ({ success: true, hostname: 'localhost', challenge_ts: new Date(clock - 1000).toISOString() });
const json = (data) => ({ ok: true, async json() { return data; } });
const verifier = (fetchImpl, overrides = {}) => createRecaptchaV2Verifier({
  siteKey: 'test-site-key', secretKey: 'private-test-secret', expectedHostname: 'localhost',
  fetchImpl, ...overrides
});

test('v2 verification sends the proof and server secret only to Google', async () => {
  const captcha = verifier(async (url, options) => {
    assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('secret'), 'private-test-secret');
    assert.equal(options.body.get('response'), 'browser-proof');
    assert.equal(options.redirect, 'error');
    return json(valid());
  });
  assert.deepEqual(await captcha.verify('browser-proof'), { ok: true });
  assert.equal(captcha.secretKey, undefined);
});

test('missing and malformed proof never calls Google', async () => {
  const captcha = verifier(() => assert.fail('provider must not be called'));
  for (const proof of [undefined, '', ' ', ['token'], 'x'.repeat(8193)]) {
    assert.deepEqual(await captcha.verify(proof), { ok: false, reason: 'invalid' });
  }
});

test('unconfigured provider fails closed', async () => {
  const captcha = verifier(() => assert.fail('provider called'), { secretKey: '' });
  assert.equal(captcha.isConfigured(), false);
  assert.deepEqual(await captcha.verify('token'), { ok: false, reason: 'unavailable' });
});

test('wrong hostname cannot pass even when Google reports success', async () => {
  const captcha = verifier(async () => json({ ...valid(), hostname: 'attacker.example' }));
  assert.deepEqual(await captcha.verify('token'), { ok: false, reason: 'invalid' });
});

test('a fresh valid solution is accepted after a long challenge; Google decides token expiry', async () => {
  const captcha = verifier(async () => json({ ...valid(), challenge_ts: new Date(clock - 180000).toISOString() }));
  assert.deepEqual(await captcha.verify('new-solution-after-slow-challenge'), { ok: true });
});

test('Google rejected or expired/replayed tokens cannot pass', async () => {
  for (const code of ['timeout-or-duplicate', 'invalid-input-response']) {
    const captcha = verifier(async () => json({ success: false, 'error-codes': [code] }));
    assert.deepEqual(await captcha.verify('token'), { ok: false, reason: 'invalid' });
  }
});

test('provider/config failures produce a safe technical failure', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('network error with private-test-secret'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, async json() { throw new Error('bad JSON'); } }),
    async () => json(null), async () => json({ success: 'true' }),
    async () => json({ success: false, 'error-codes': ['invalid-input-secret'] })
  ]) assert.deepEqual(await verifier(fetchImpl).verify('token'), { ok: false, reason: 'unavailable' });
});
