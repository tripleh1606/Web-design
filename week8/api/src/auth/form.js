const { fail } = require('./response');

function jsonForm(...fields) {
  const allowed = new Set(fields);
  return (req, res, next) => {
    if (!req.is('application/json')) return fail(res, 415, 'INVALID_CONTENT_TYPE', 'Biểu mẫu phải được gửi dưới dạng JSON.');
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.entries(body).some(([key, value]) => !allowed.has(key) || typeof value !== 'string')) {
      return fail(res, 400, 'VALIDATION_FAILED', 'Dữ liệu biểu mẫu không hợp lệ.');
    }
    return next();
  };
}

module.exports = { jsonForm };
