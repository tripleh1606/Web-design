const { createSecretKey, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { fail } = require('./response');
const { ROLES } = require('./policy');

const issuer = 'soucha-week8';
const audience = 'soucha-week8-api';
const algorithm = 'HS256';
const lifetimeSeconds = 60;

function createAccessTokens(secret, prisma) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    throw new Error('JWT_ACCESS_SECRET must be 32 random bytes encoded as base64url.');
  }
  const bytes = Buffer.from(secret, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== secret) {
    throw new Error('JWT_ACCESS_SECRET must be 32 random bytes encoded as base64url.');
  }
  const key = createSecretKey(bytes);

  function issue(userId, { mfaVerified = false, authVersion = 0 } = {}) {
    return jwt.sign({ mfa: mfaVerified, av: authVersion }, key, {
      algorithm, issuer, audience, subject: String(userId), jwtid: randomUUID(), expiresIn: lifetimeSeconds
    });
  }

  async function requireAccessToken(req, res, next) {
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
      try {
        const user = await prisma.user.findUnique({
          where: { id: Number(claims.sub) },
          select: { id: true, email: true, role: true, status: true, chefId: true }
        });
        if (user && user.status === 'active' && ROLES.includes(user.role)) {
          req.auth = { userId: user.id, email: user.email, role: user.role, status: user.status, chefId: user.chefId };
          req.accessClaims = claims;
          return next();
        }
      } catch (error) {
        return next(error);
      }
    }
    res.set('WWW-Authenticate', authorization ? 'Bearer realm="soucha-week8", error="invalid_token"' : 'Bearer realm="soucha-week8"');
    return fail(res, 401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập để tiếp tục.');
  }

  return { issue, requireAccessToken };
}

module.exports = { createAccessTokens };
