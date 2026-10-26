const express = require('express');
const { resources, parseId, validate } = require('./validation');
const { dishInclude, chefInclude, viewRecord, recipeData, BusinessError, registerRelations } = require('./relations');
const { parsePageQuery, dishPage } = require('./pagination');

const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const success = (res, data) => res.status(200).json({ ok: true, data });
const failure = (res, code, message, fields) => res.status(200).json({
  ok: false, error: { code, message, ...(fields ? { fields } : {}) }
});
const notFound = (res) => failure(res, 'NOT_FOUND', 'Bản ghi không tồn tại.');

function createApp({ prisma, spaOrigin, logger = console, provider = 'postgresql' }) {
  if (!prisma) throw new Error('Prisma client is required.');
  const origin = new URL(spaOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== spaOrigin) {
    throw new Error('SPA_ORIGIN phải là một origin HTTP(S) cụ thể, không có dấu / cuối.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.vary('Origin');
    res.set('Cache-Control', 'no-store');
    if (req.headers.origin) {
      if (req.headers.origin !== spaOrigin) return res.status(403).json({ message: 'Origin không được phép.' });
      res.set('Access-Control-Allow-Origin', spaOrigin);
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  // One server-paged API serves numbered pages, Load More and Infinite Scroll.
  // Register before /api/dishes/:id so "paged" is not mistaken for an ID.
  app.get('/api/dishes/paged', route(async (req, res) => {
    const { fields, value } = parsePageQuery(req.query);
    if (Object.keys(fields).length) return res.status(200).json({
      ok: false, data: null,
      error: { code: 'VALIDATION_FAILED', message: 'Điều kiện phân trang không hợp lệ.', fields }
    });
    if ((value.mode === 'fulltext' || (value.mode === 'smart' && value.q !== undefined)) && provider !== 'postgresql') return res.status(200).json({
      ok: false, data: null, error: { code: 'FULLTEXT_REQUIRES_POSTGRESQL', message: 'Tìm kiếm Full-text/Thông minh cần PostgreSQL/Supabase. Với SQLite, chọn Theo tên.' }
    });
    const data = await dishPage(prisma, value);
    return res.status(200).json({ ok: true, data, error: null });
  }));

  for (const [resource, config] of Object.entries(resources)) {
    const base = `/api/${resource}`;
    const model = prisma[config.model];
    const include = resource === 'dishes' ? dishInclude : resource === 'chefs' ? chefInclude : undefined;
    app.get(base, route(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
      const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 120) : '';
      const sort = req.query.sort;
      const rows = await model.findMany({ orderBy: resource === 'dishes' && ['price-asc', 'price-desc'].includes(sort) ? { price: sort === 'price-asc' ? 'asc' : 'desc' } : { id: 'desc' } });
      // Unicode-aware matching works consistently for both SQLite and PostgreSQL.
      const data = rows.filter((row) => (!q || row.name.toLocaleLowerCase('vi').includes(q.toLocaleLowerCase('vi'))) && (resource !== 'dishes' || !category || row.category === category));
      return success(res, data);
    }));
    app.get(`${base}/:id`, route(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res);
      const record = await model.findUnique({ where: { id }, include });
      return record ? success(res, viewRecord(resource, record)) : notFound(res);
    }));
    app.post(base, route(async (req, res) => {
      const { data, fields } = validate(resource, req.body);
      if (Object.keys(fields).length) return failure(res, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ.', fields);
      const created = resource === 'dishes' && Object.hasOwn(req.body, 'ingredients') ?
        await prisma.$transaction(async (tx) => {
          const recipe = await recipeData(tx, req.body.ingredients);
          return tx.dish.create({ data: { ...data, ingredients: { create: recipe } }, include });
        }) : await model.create({ data, include });
      return success(res, viewRecord(resource, created));
    }));
    app.patch(`${base}/:id`, route(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res);
      const { data, fields } = validate(resource, req.body, true);
      if (Object.keys(fields).length) return failure(res, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ.', fields);
      try {
        const updated = resource === 'dishes' && Object.hasOwn(req.body, 'ingredients') ?
          await prisma.$transaction(async (tx) => {
            const recipe = await recipeData(tx, req.body.ingredients);
            return tx.dish.update({ where: { id }, data: { ...data, ingredients: { deleteMany: {}, create: recipe } }, include });
          }) : await model.update({ where: { id }, data, include });
        return success(res, viewRecord(resource, updated));
      } catch (error) {
        if (error.code === 'P2025') return notFound(res);
        throw error;
      }
    }));
    app.delete(`${base}/:id`, route(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res);
      try {
        await model.delete({ where: { id } });
        return success(res, null);
      } catch (error) {
        if (error.code === 'P2025') return notFound(res);
        throw error;
      }
    }));
  }
  registerRelations(app, { prisma, route, success, notFound });
  app.use((_req, res) => res.status(404).json({ message: 'URL hoặc HTTP method không tồn tại.' }));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    if (error instanceof BusinessError) return failure(res, error.code, error.message, error.fields);
    if (error.code === 'P2025') return notFound(res);
    if (error.code === 'P2002') return failure(res, 'VALIDATION_FAILED', 'Liên kết đã tồn tại.', { _form: 'Liên kết đã tồn tại. Vui lòng tải lại trang.' });
    if (error.code === 'P2003') return failure(res, 'VALIDATION_FAILED', 'Dữ liệu liên quan đã thay đổi.', { _form: 'Nguyên liệu hoặc món ăn đã bị xóa. Vui lòng tải lại trang.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON không đọc được.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Body quá lớn.' });
    // Never log raw errors: Prisma errors may include a connection URL.
    logger.error('API error', { name: error.name, code: error.code || 'UNKNOWN' });
    return res.status(500).json({ message: 'Máy chủ tạm thời không thể xử lý yêu cầu.' });
  });
  return app;
}
module.exports = { createApp };
