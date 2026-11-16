const { randomBytes, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } = require('node:crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes) {
  let bits = 0, value = 0, text = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { text += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) text += ALPHABET[(value << (5 - bits)) & 31];
  return text;
}
function decode32(text) {
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error('Invalid TOTP secret');
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

function totp(secret, step, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', decode32(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, '0');
}
function matchStep(secret, code, now, lastStep = -1) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(Number(now) / 30_000);
  for (const step of [current, current - 1, current + 1]) {
    if (step >= 0 && step > (lastStep ?? -1) && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

function createSecretVault(encodedKey) {
  if (!encodedKey) return null;
  const key = Buffer.from(encodedKey, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== encodedKey) throw new Error('MFA_ENCRYPTION_KEY must be 32 random bytes encoded as base64url.');
  const aad = (userId) => Buffer.from('soucha-week8-mfa:' + userId);
  return {
    encrypt(secret, userId) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(aad(userId));
      const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
    },
    decrypt(encoded, userId) {
      const bytes = Buffer.from(encoded, 'base64url');
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAAD(aad(userId));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
    }
  };
}
const generateSecret = () => base32(randomBytes(20));
const generateRecoveryCodes = () => Array.from({ length: 8 }, () => randomBytes(10).toString('hex').toUpperCase().match(/.{4}/g).join('-'));
const normalizeRecoveryCode = (code) => typeof code === 'string' ? code.trim().toUpperCase().replace(/-/g, '') : '';
module.exports = { base32, totp, matchStep, createSecretVault, generateSecret, generateRecoveryCodes, normalizeRecoveryCode };
