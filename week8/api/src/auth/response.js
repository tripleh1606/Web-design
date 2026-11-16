const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function ok(res, data) {
  return res.json({ ok: true, data });
}

function fail(res, status, code, message, details = {}) {
  return res.status(status).json({ ok: false, error: { code, message, ...details } });
}

module.exports = { asyncRoute, ok, fail };
