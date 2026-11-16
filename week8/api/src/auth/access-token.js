const { createSecretKey, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { fail } = require('./response');

const issuer = 'soucha-week7';
const audience = 'soucha-week7-api';
const algorithm = 'HS256';
const lifetimeSeconds = 60;

function createAccessTokens(secret) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    throw new Error('JWT_ACCESS_SECRET must be 32 random bytes encoded as base64url.');
  }
  const bytes = Buffer.from(secret, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== secret) {
    throw new Error('JWT_ACCESS_SECRET must be 32 random bytes encoded as base64url.');
  }
  const key = createSecretKey(bytes);

  function issue(userId) {
    return jwt.sign({}, key, {
      algorithm, issuer, audience, subject: String(userId), jwtid: randomUUID(), expiresIn: lifetimeSeconds
    });
  }

  function requireAccessToken(req, res, next) {
    const authorization = req.get('Authorization') || '';
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
    let claims;
    if (match && match[1].length <= 2048) {
      try {
        claims = jwt.verify(match[1], key, { algorithms: [algorithm], issuer, audience, maxAge: lifetimeSeconds });
      } catch {
        // Invalid tokens are not logged or reflected back to the client.
      }
    }
    if (Number.isSafeInteger(claims?.exp) && typeof claims.sub === 'string' &&
        /^[1-9]\d{0,9}$/.test(claims.sub) && Number(claims.sub) <= 2147483647) {
      req.auth = { userId: Number(claims.sub) };
      return next();
    }
    res.set('WWW-Authenticate', authorization ? 'Bearer realm="soucha-week7", error="invalid_token"' : 'Bearer realm="soucha-week7"');
    return fail(res, 401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập để tiếp tục.');
  }

  return { issue, requireAccessToken };
}

module.exports = { createAccessTokens };
