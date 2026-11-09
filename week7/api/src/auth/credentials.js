const crypto = require('node:crypto');
const { promisify } = require('node:util');
const argon2 = require('argon2');
const validator = require('validator');
const scrypt = promisify(crypto.scrypt);
const TOKEN = /^[a-f0-9]{64}$/;
const ARGON_OPTIONS = Object.freeze({ type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim(), at = trimmed.lastIndexOf('@');
  return at < 0 ? trimmed : trimmed.slice(0, at + 1) + trimmed.slice(at + 1).toLowerCase();
}
function validateEmail(value) {
  return typeof value === 'string' && value.length <= 254 && validator.isEmail(value, { allow_utf8_local_part: false });
}
const generateRawToken = () => crypto.randomBytes(32).toString('hex');
const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const hashToken = value => crypto.createHash('sha256').update(value).digest('hex');
const hashPassword = password => argon2.hash(password, ARGON_OPTIONS);
let dummyHashPromise;
async function dummyVerify(password) {
  dummyHashPromise ||= hashPassword(generateRawToken());
  await argon2.verify(await dummyHashPromise, password);
  return false;
}
async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string') return false;
  try {
    if (hash.startsWith('$argon2id$')) return await argon2.verify(hash, password);
    // Verify old coursework hashes while creating only Argon2id hashes for new credentials.
    if (/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)) {
      const [, salt, key] = hash.split('$');
      const actual = await scrypt(password, Buffer.from(salt, 'hex'), 64);
      return crypto.timingSafeEqual(actual, Buffer.from(key, 'hex'));
    }
  } catch { /* Malformed stored hashes never authenticate. */ }
  return false;
}
module.exports = { TOKEN, ARGON_OPTIONS, normalizeEmail, validateEmail, generateRawToken, generateOtp,
  hashToken, hashPassword, verifyPassword, dummyVerify };
