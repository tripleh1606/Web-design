const crypto = require('node:crypto');
const argon2 = require('argon2');
const isEmail = require('validator/lib/isEmail');

// Preserve local-part, dots and plus tags. All auth features use this policy.
function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim();
  const at = email.lastIndexOf('@');
  return at < 0 ? email : email.slice(0, at + 1) + email.slice(at + 1).toLowerCase();
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && isEmail(value, {
    allow_utf8_local_part: false,
    allow_display_name: false,
    require_tld: true
  });
}

const ARGON_OPTIONS = Object.freeze({ type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1, hashLength: 32 });
const hashPassword = password => argon2.hash(password, ARGON_OPTIONS);
const generateOtp = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');
const hashOtp = otp => argon2.hash(otp, ARGON_OPTIONS);
async function verifyOtp(otp, hash) {
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp) || typeof hash !== 'string' || !hash.startsWith('$argon2id$')) return false;
  return argon2.verify(hash, otp);
}

module.exports = { normalizeEmail, validEmail, hashPassword, generateOtp, hashOtp, verifyOtp, ARGON_OPTIONS };
