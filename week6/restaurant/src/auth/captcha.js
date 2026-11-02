function createRecaptchaVerifier(env = process.env, fetchImpl = globalThis.fetch) {
  const siteKey = env.RECAPTCHA_SITE_KEY || '', secret = env.RECAPTCHA_SECRET_KEY || '';
  if (env.RECAPTCHA_ADAPTER && env.RECAPTCHA_ADAPTER !== 'v3') throw new Error('This deployment requires reCAPTCHA v3 site/secret keys');
  const minScore = Number(env.RECAPTCHA_MIN_SCORE ?? 0.5);
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) throw new Error('Invalid RECAPTCHA_MIN_SCORE');
  let hostname;
  try { hostname = new URL(env.APP_BASE_URL).hostname; } catch {}
  return {
    siteKey,
    isConfigured: () => Boolean(siteKey && secret && hostname),
    async verifyToken(token, remoteIp, expectedAction = 'login') {
      if (!siteKey || !secret || !hostname) return { ok: false, reason: 'not-configured' };
      if (typeof token !== 'string' || !token || token.length > 8192) return { ok: false, reason: 'invalid' };
      try {
        const body = new URLSearchParams({ secret, response: token });
        if (remoteIp) body.set('remoteip', remoteIp);
        const response = await fetchImpl('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST', body, signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) return { ok: false, reason: 'network-error' };
        const result = await response.json();
        if (result['error-codes']?.some(code => ['missing-input-secret', 'invalid-input-secret', 'bad-request'].includes(code))) return { ok: false, reason: 'provider-error' };
        const age = Date.now() - Date.parse(result.challenge_ts);
        const ok = result.success === true && result.hostname === hostname && result.action === expectedAction
          && typeof result.score === 'number' && result.score >= minScore && result.score <= 1
          && Number.isFinite(age) && age >= -30000 && age <= 120000;
        return { ok, reason: ok ? null : 'invalid' };
      } catch { return { ok: false, reason: 'network-error' }; }
    }
  };
}
module.exports = { createRecaptchaVerifier };
