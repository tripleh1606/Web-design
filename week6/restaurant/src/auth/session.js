const { TOKEN, generateRawToken, hashToken, safeEqualToken } = require('./credentials');
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const FORM_PATHS = new Set(['/register', '/activate', '/login', '/forgot', '/reset']);

function parseCookies(header = '') {
  const result = Object.create(null), seen = new Set();
  for (const pair of header.split(';')) {
    const pos = pair.indexOf('=');
    if (pos < 1) continue;
    const name = pair.slice(0, pos).trim();
    if (seen.has(name)) { delete result[name]; continue; }
    seen.add(name);
    try { result[name] = decodeURIComponent(pair.slice(pos + 1).trim()); } catch {}
  }
  return result;
}
function serializeCookie(name, value, config, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${config.cookieSecure ? '; Secure' : ''}${maxAge === 0 ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT' : ''}`;
}
function setSessionCookie(res, token, config, ttlMs = config.sessionTtlMs) {
  res.append('Set-Cookie', serializeCookie(config.sessionCookieName, token, config, Math.floor(ttlMs / 1000)));
}
function clearSessionCookie(res, config) {
  res.append('Set-Cookie', serializeCookie(config.sessionCookieName, '', config, 0));
}
async function createSessionForUser({ prisma, userId, authConfig, res }) {
  const rawToken = generateRawToken(), now = new Date();
  const ttl = userId == null ? authConfig.anonymousTtlMs : authConfig.sessionTtlMs;
  const data = { sidHash: hashToken(rawToken), csrfToken: generateRawToken(), userId: userId ?? null,
    createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + ttl) };
  const session = await prisma.session.create({ data });
  if (res) setSessionCookie(res, rawToken, authConfig, ttl);
  return { ...session, ...data, rawToken };
}
function attachSessionMiddleware({ prisma, authConfig, clock = () => new Date() }) {
  const activeUser = session => session?.user?.status === 'active' && session.user.emailVerifiedAt;
  const isCurrent = (session, now) => session && session.expiresAt > now &&
    session.lastSeenAt > new Date(now.getTime() - authConfig.sessionIdleMs) && (session.userId == null || activeUser(session));
  return asyncRoute(async (req, res, next) => {
    req.authConfig = authConfig;
    req.cookies = parseCookies(req.headers.cookie);
    req.auth = { user: null, session: null, rawToken: null };
    res.locals.currentUser = null;
    res.locals.csrfToken = '';
    const raw = req.cookies[authConfig.sessionCookieName];
    if (raw !== undefined) {
      if (TOKEN.test(raw)) {
        let session = await prisma.session.findUnique({ where: { sidHash: hashToken(raw) }, include: { user: true } });
        // Read latency must not turn a timestamp captured before the DB wait into new activity.
        const now = clock(), idleCutoff = new Date(now.getTime() - authConfig.sessionIdleMs);
        if (isCurrent(session, now)) {
          // Never upsert: logout may have deleted this row between read and touch.
          const touched = await prisma.session.updateMany({
            where: { sidHash: session.sidHash, expiresAt: { gt: now }, lastSeenAt: { gt: idleCutoff, lte: now } }, data: { lastSeenAt: now }
          });
          if (touched.count === 1) session = { ...session, lastSeenAt: now };
          else {
            // A newer overlapping request can already have advanced lastSeenAt. Distinguish
            // that harmless no-op from a row revoked/expired during the update attempt.
            session = await prisma.session.findUnique({ where: { sidHash: session.sidHash }, include: { user: true } });
            if (!session || session.lastSeenAt <= now) session = null;
          }
          if (isCurrent(session, clock())) {
            const user = activeUser(session) ? session.user : null;
            req.auth = { user, session, rawToken: raw };
            res.locals.currentUser = user ? { id: user.id, email: user.email } : null;
            res.locals.csrfToken = session.csrfToken;
          } else clearSessionCookie(res, authConfig);
        } else {
          // Cleanup must not delete a valid row refreshed after our initial read.
          if (session) await prisma.session.deleteMany({ where: { sidHash: session.sidHash,
            OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lte: idleCutoff } }] } });
          clearSessionCookie(res, authConfig);
        }
      } else clearSessionCookie(res, authConfig);
    }
    if (!req.auth.session && req.method === 'GET' && FORM_PATHS.has(req.path)) {
      const session = await createSessionForUser({ prisma, userId: null, authConfig, res });
      req.auth = { user: null, session, rawToken: session.rawToken };
      res.locals.csrfToken = session.csrfToken;
    }
    next();
  });
}
function requireLogin(req, res, next) {
  if (req.auth?.user?.status === 'active' && req.auth.user.emailVerifiedAt && req.auth.session?.userId === req.auth.user.id) return next();
  return res.redirect(303, '/login');
}
function requireCsrf(req, res, next) {
  const origin = req.get('Origin') || req.get('Referer');
  let validOrigin = true;
  if (origin === 'null') {
    // Native forms under no-referrer can send Origin:null. Fetch metadata must
    // identify a same-origin browser request to the configured host; the
    // session-bound CSRF token remains mandatory below in every case.
    const expectedHost = new URL(req.authConfig.appBaseUrl).host.toLowerCase();
    validOrigin = req.get('Sec-Fetch-Site') === 'same-origin' && req.get('Host')?.toLowerCase() === expectedHost;
  } else if (origin) {
    try { validOrigin = new URL(origin).origin === req.authConfig.appBaseUrl; } catch { validOrigin = false; }
  }
  if (!validOrigin || !safeEqualToken(req.auth?.session?.csrfToken, req.body?._csrf)) {
    const code = !validOrigin ? 'ORIGIN_MISMATCH' : !req.auth?.session ? 'SESSION_EXPIRED' : 'FORM_STALE';
    const retryPaths = new Map([
      ['/register', '/register'], ['/login', '/login'], ['/activate', '/activate'],
      ['/activate/resend', '/activate'], ['/forgot', '/forgot'], ['/reset', '/forgot'],
      ['/logout', '/logout/confirm']
    ]);
    const retryPath = retryPaths.get(req.path) || '/login';
    const messages = {
      ORIGIN_MISMATCH: 'Địa chỉ gửi biểu mẫu không khớp với ứng dụng. Hãy mở lại biểu mẫu từ liên kết bên dưới.',
      SESSION_EXPIRED: 'Phiên làm việc đã hết hạn hoặc cookie phiên không được gửi. Hãy mở lại biểu mẫu rồi thử lại.',
      FORM_STALE: 'Biểu mẫu không còn khớp với phiên hiện tại. Hãy mở lại biểu mẫu, nhập lại thông tin và thử lại.'
    };
    return res.status(403).render('error', {
      title: 'Vui lòng mở lại biểu mẫu', status: 403, code, message: messages[code],
      back: validOrigin ? retryPath : new URL(retryPath, req.authConfig.appBaseUrl).href,
      backLabel: req.path === '/register' ? 'Mở lại form đăng ký' : 'Mở lại biểu mẫu'
    });
  }
  next();
}
module.exports = { attachSessionMiddleware, requireLogin, requireCsrf, clearSessionCookie, setSessionCookie,
  createSessionForUser, parseCookies, serializeCookie };
