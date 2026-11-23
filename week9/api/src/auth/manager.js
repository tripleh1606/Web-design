import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError, asyncRoute } from '../services/errors.js';

const hash = text => createHash('sha256').update(text).digest('hex');
const cookieName = 'gallery_session';
function readToken(req) {
  const matches = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${cookieName}=`));
  const token = matches.length === 1 ? matches[0].slice(cookieName.length + 1) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function createManager({ repository, config }) {
  const secretHash = Buffer.from(hash(config.capability), 'hex');
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: config.secureCookie, path: '/' };
  // Local single-server deployment: bound memory and limit failed login attempts.
  const attempts = new Map();
  function rateLimit(req) {
    const now = Date.now(), key = req.socket.remoteAddress;
    let entry = attempts.get(key);
    if (!entry || entry.until <= now) {
      if (attempts.size >= 1000) attempts.delete(attempts.keys().next().value);
      entry = { count: 0, until: now + 15 * 60_000 };
      attempts.set(key, entry);
    }
    if (entry.count >= 10) throw new ApiError(429, 'LOGIN_RATE_LIMIT', 'Đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.');
    return entry;
  }

  const requireOrigin = (req, res, next) => {
    if (req.headers.origin !== config.publicOrigin) { next(new ApiError(403, 'ORIGIN_FORBIDDEN', 'Origin không được phép thực hiện thao tác này.')); return; }
    next();
  };
  async function session(req) {
    const token = readToken(req);
    return token ? repository.findSession(hash(token)) : null;
  }
  return {
    requireOrigin,
    requireSession: asyncRoute(async (req, res, next) => {
      if (!await session(req)) throw new ApiError(401, 'AUTH_REQUIRED', 'Cần đăng nhập quản lý.');
      next();
    }),
    status: asyncRoute(async (req, res) => res.json({ authenticated: Boolean(await session(req)) })),
    login: asyncRoute(async (req, res) => {
      const attempt = rateLimit(req);
      if (!req.is('application/json') || !req.body || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || typeof req.body.capability !== 'string') throw new ApiError(400, 'INVALID_LOGIN', 'Cần JSON gồm một trường capability.');
      if (!timingSafeEqual(Buffer.from(hash(req.body.capability), 'hex'), secretHash)) {
        attempt.count++;
        throw new ApiError(401, 'INVALID_CAPABILITY', 'Mã quản lý không hợp lệ.');
      }
      const token = randomBytes(32).toString('base64url');
      const old = readToken(req);
      if (old) await repository.deleteSession(hash(old));
      await repository.createSession(hash(token), new Date(Date.now() + config.sessionTtlSeconds * 1000));
      attempts.delete(req.socket.remoteAddress);
      res.cookie(cookieName, token, { ...cookieOptions, maxAge: config.sessionTtlSeconds * 1000 });
      res.status(204).end();
    }),
    logout: asyncRoute(async (req, res) => {
      const token = readToken(req);
      if (token) await repository.deleteSession(hash(token));
      res.clearCookie(cookieName, cookieOptions);
      res.status(204).end();
    }),
  };
}
