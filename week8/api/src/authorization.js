const { can } = require('./auth/policy');

function allowed(req, action) {
  return req.authDisabled || can(req.auth?.role, action);
}
function requireAction(action) {
  return (req, res, next) => allowed(req, action) ? next() : res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Không có quyền truy cập.' } });
}
function scope(req, resource) {
  const { role, chefId, userId } = req.auth || {};
  if (req.authDisabled) return {};
  const linkedChef = { chefId: chefId || 0, chef: { user: { is: { id: userId, role: 'chef', status: 'active' } } } };
  if (resource === 'dishes') {
    if (role === 'customer') return { available: true };
    if (role === 'chef') return { chefs: { some: linkedChef } };
  }
  if (role === 'chef' && resource === 'chefs') return { id: chefId || 0, user: { is: { id: userId, role: 'chef', status: 'active' } } };
  if (role === 'chef' && resource === 'ingredients') return { dishes: { some: { dish: { chefs: { some: linkedChef } } } } };
  return {};
}
module.exports = { allowed, requireAction, scope };
