const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

function createRecaptchaV2Verifier({
  siteKey = '', secretKey = '', expectedHostname = '',
  fetchImpl = globalThis.fetch, timeoutMs = 5000
} = {}) {
  const hostname = expectedHostname.toLowerCase();
  const isConfigured = () => Boolean(siteKey && secretKey && hostname);

  async function verify(token) {
    if (!isConfigured()) return { ok: false, reason: 'unavailable' };
    if (typeof token !== 'string' || !token.trim() || token.length > 8192) {
      return { ok: false, reason: 'invalid' };
    }
    try {
      const response = await fetchImpl(VERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: secretKey, response: token }),
        redirect: 'error', signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) return { ok: false, reason: 'unavailable' };
      const result = await response.json();
      if (!result || typeof result !== 'object' || typeof result.success !== 'boolean') {
        return { ok: false, reason: 'unavailable' };
      }
      if (!result.success) {
        const codes = Array.isArray(result['error-codes']) ? result['error-codes'] : [];
        const unavailable = codes.some((code) => [
          'missing-input-secret', 'invalid-input-secret', 'bad-request'
        ].includes(code));
        return { ok: false, reason: unavailable ? 'unavailable' : 'invalid' };
      }
      // challenge_ts is when the challenge loaded, not when the response token
      // was issued. Google enforces token expiry/single-use during siteverify.
      if (typeof result.hostname !== 'string' || result.hostname.toLowerCase() !== hostname) {
        return { ok: false, reason: 'invalid' };
      }
      return { ok: true };
    } catch {
      // Provider request/payload may contain secrets; do not pass them into logs.
      return { ok: false, reason: 'unavailable' };
    }
  }
  return { siteKey, isConfigured, verify };
}

module.exports = { createRecaptchaV2Verifier };
