function registrationPolicy(overrides = {}, env = process.env) {
  const defaults = {
    otpTtlMs: [600000, 'ACTIVATION_OTP_TTL_SECONDS', 1000],
    otpMaxAttempts: [5, 'ACTIVATION_MAX_ATTEMPTS', 1],
    otpLockMs: [900000, 'ACTIVATION_LOCK_SECONDS', 1000],
    resendCooldownMs: [60000, 'ACTIVATION_RESEND_COOLDOWN_SECONDS', 1000],
    dispatchEmailMax: [5, 'ACTIVATION_EMAIL_MAX_PER_HOUR', 1],
    dispatchIpMax: [20, 'ACTIVATION_IP_MAX_PER_15_MINUTES', 1],
    registerEmailMax: [5, 'REGISTER_EMAIL_MAX_PER_15_MINUTES', 1],
    registerIpMax: [20, 'REGISTER_IP_MAX_PER_15_MINUTES', 1],
    activateEmailMax: [10, 'ACTIVATE_EMAIL_MAX_PER_MINUTE', 1],
    activateIpMax: [30, 'ACTIVATE_IP_MAX_PER_MINUTE', 1]
  };
  return Object.fromEntries(Object.entries(defaults).map(([key, [fallback, name, scale]]) => {
    const value = overrides[key] ?? (env[name] === undefined ? fallback : Number(env[name]) * scale);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
    return [key, value];
  }));
}
module.exports = { registrationPolicy };
