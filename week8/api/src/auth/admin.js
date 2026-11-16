const express = require('express');
const { asyncRoute, ok, fail } = require('./response');
const { ROLES, can } = require('./policy');

const select = { id: true, email: true, role: true, status: true, chefId: true };
async function lockIdentity(tx, provider) {
  if (provider === 'postgresql') await tx.$queryRaw`SELECT pg_advisory_xact_lock(73427821)::text`;
  else await tx.$executeRaw`UPDATE users SET role = role WHERE 1 = 0`;
}
function createAdminRouter({ prisma, provider, logger }) {
  const router = express.Router();
  router.use('/users', (req, res, next) => can(req.auth.role, 'user.role.update') ? next() : fail(res, 403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.'));
  router.get('/users', asyncRoute(async (req, res) => {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const pageSize = req.query.pageSize === undefined ? 10 : Number(req.query.pageSize);
    if (Object.keys(req.query).some(k => !['page', 'pageSize'].includes(k)) ||
        !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (page - 1) * pageSize > 2147483647 ||
        (req.query.page !== undefined && (typeof req.query.page !== 'string' || !/^\d+$/.test(req.query.page))) ||
        (req.query.pageSize !== undefined && (typeof req.query.pageSize !== 'string' || !/^\d+$/.test(req.query.pageSize)))) {
      return fail(res, 400, 'VALIDATION_FAILED', 'Trang không hợp lệ.');
    }
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({ select, orderBy: { id: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.user.count()
    ]);
    return ok(res, { items, total, page, pageSize });
  }));
  router.patch('/users/:id/:operation', asyncRoute(async (req, res) => {
    const { id: rawId, operation } = req.params;
    if (!['role', 'chef'].includes(operation)) return fail(res, 404, 'NOT_FOUND', 'Bản ghi không tồn tại.');
    const id = Number(rawId);
    if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(id) || id > 2147483647) return fail(res, 404, 'NOT_FOUND', 'Bản ghi không tồn tại.');
    const body = req.body;
    const key = operation === 'role' ? 'role' : 'chefId';
    if (!req.is('application/json') || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, key) ||
        (key === 'role' ? !ROLES.includes(body.role) : body.chefId !== null && (!Number.isSafeInteger(body.chefId) || body.chefId < 1 || body.chefId > 2147483647))) {
      return fail(res, 400, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ.');
    }
    let result;
    try {
      result = await prisma.$transaction(async tx => {
        await lockIdentity(tx, provider);
        const actor = await tx.user.findUnique({ where: { id: req.auth.userId }, select });
        if (!actor || actor.status !== 'active' || actor.role !== 'admin') return { forbidden: true };
        const old = await tx.user.findUnique({ where: { id }, select });
        if (!old) return { missing: true };
        if (operation === 'role' && old.role === 'admin' && old.status === 'active' && body.role !== 'admin' &&
            await tx.user.count({ where: { role: 'admin', status: 'active' } }) <= 1) return { lastAdmin: true };
        if (operation === 'chef' && body.chefId !== null) {
          if (old.role !== 'chef') return { invalidLink: true };
          if (!await tx.chef.findUnique({ where: { id: body.chefId }, select: { id: true } })) return { invalidLink: true };
        }
        const data = operation === 'role' ? { role: body.role, ...(body.role !== 'chef' ? { chefId: null } : {}) } : { chefId: body.chefId };
        const user = await tx.user.update({ where: { id }, data, select });
        return { user, old };
      });
    } catch (error) {
      if (error.code === 'P2002' || error.code === 'P2003') return fail(res, 409, 'LINK_CONFLICT', 'Liên kết đầu bếp không hợp lệ hoặc đã được sử dụng.');
      throw error;
    }
    if (result.forbidden) return fail(res, 403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
    if (result.missing) return fail(res, 404, 'NOT_FOUND', 'Bản ghi không tồn tại.');
    if (result.lastAdmin) return fail(res, 409, 'LAST_ADMIN', 'Phải giữ ít nhất một quản trị viên đang hoạt động.');
    if (result.invalidLink) return fail(res, 400, 'VALIDATION_FAILED', 'Liên kết đầu bếp không hợp lệ.');
    logger.info?.('Identity changed', { actorId: req.auth.userId, targetId: id, oldRole: result.old.role, newRole: result.user.role, oldChefId: result.old.chefId, newChefId: result.user.chefId });
    return ok(res, result.user);
  }));
  return router;
}
module.exports = { createAdminRouter, lockIdentity };
