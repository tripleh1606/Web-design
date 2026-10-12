const path = require('node:path');
const express = require('express');
const methodOverride = require('method-override');
const { resources, parseId, validate, valuesFromRecord } = require('./validation');
const { categories, categoryLabel, formatVND } = require('./soucha-menu');

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function createApp({ prisma, logger = console }) {
  if (!prisma) throw new Error('A Prisma client is required.');

  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  // HTML forms submit POST; the action URL carries the intended method.
  app.use(methodOverride((req) => req.query._method, { methods: ['POST'] }));
  app.use('/static', express.static(path.join(__dirname, '..', 'public')));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.locals.categoryLabel = categoryLabel;
  app.locals.formatVND = formatVND;

  const notFound = (res, back = '/dishes') => res.status(404).render('error', {
    title: 'Không tìm thấy',
    status: 404,
    message: 'Trang hoặc bản ghi này không tồn tại.',
    back
  });

  app.get('/', (_req, res) => res.redirect(302, '/dishes'));

  app.get('/dishes', asyncRoute(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 120) : '';
    const sort = ['price-asc', 'price-desc'].includes(req.query.sort) ? req.query.sort : 'default';
    const where = {
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      ...(category ? { category } : {})
    };
    const dishes = await prisma.dish.findMany({
      where,
      orderBy: sort === 'default' ? { id: 'asc' } : { price: sort === 'price-asc' ? 'asc' : 'desc' }
    });
    res.render('dishes/index', { title: 'Thực đơn', dishes, q, category, sort, categories });
  }));

  app.get('/dishes/:id', asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    const dish = await prisma.dish.findUnique({ where: { id } });
    if (!dish) return notFound(res);
    res.render('dishes/show', { title: dish.name, dish });
  }));

  app.get('/admin', (_req, res) => res.redirect(302, '/admin/dishes'));

  for (const [resource, config] of Object.entries(resources)) {
    const base = `/admin/${resource}`;
    const model = prisma[config.model];

    app.get(base, asyncRoute(async (_req, res) => {
      const rows = await model.findMany({ orderBy: { id: 'desc' } });
      res.render('admin/index', { title: config.plural, resource, config, rows });
    }));

    app.get(`${base}/new`, (_req, res) => res.render('admin/form', {
      title: `Thêm ${config.singular.toLowerCase()}`,
      resource, config, record: null, values: resource === 'dishes' ? { available: true } : {}, errors: {}
    }));

    app.post(base, asyncRoute(async (req, res) => {
      const result = validate(resource, req.body);
      if (!result.valid) return res.status(400).render('admin/form', {
        title: `Thêm ${config.singular.toLowerCase()}`,
        resource, config, record: null, values: result.values, errors: result.errors
      });
      const created = await model.create({ data: result.data });
      res.redirect(303, resource === 'dishes' ? `/dishes/${created.id}` : base);
    }));

    app.get(`${base}/:id/edit`, asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res, base);
      const record = await model.findUnique({ where: { id } });
      if (!record) return notFound(res, base);
      res.render('admin/form', {
        title: `Sửa ${config.singular.toLowerCase()}`,
        resource, config, record, values: valuesFromRecord(resource, record), errors: {}
      });
    }));

    app.patch(`${base}/:id`, asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res, base);
      const record = await model.findUnique({ where: { id } });
      if (!record) return notFound(res, base);
      const result = validate(resource, req.body);
      if (!result.valid) return res.status(400).render('admin/form', {
        title: `Sửa ${config.singular.toLowerCase()}`,
        resource, config, record, values: result.values, errors: result.errors
      });
      await model.update({ where: { id }, data: result.data });
      res.redirect(303, resource === 'dishes' ? `/dishes/${id}` : base);
    }));

    app.get(`${base}/:id/delete`, asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res, base);
      const record = await model.findUnique({ where: { id } });
      if (!record) return notFound(res, base);
      res.render('admin/delete', { title: `Xóa ${config.singular.toLowerCase()}`, resource, config, record });
    }));

    app.delete(`${base}/:id`, asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res, base);
      const record = await model.findUnique({ where: { id } });
      if (!record) return notFound(res, base);
      await model.delete({ where: { id } });
      res.redirect(303, base);
    }));
  }

  app.use((_req, res) => notFound(res));
  app.use((error, _req, res, _next) => {
    // Keep credentials and raw connection URLs out of both logs and responses.
    const secret = process.env.DATABASE_URL;
    const message = String(error.message || '').replaceAll(secret || '\0', '[redacted]')
      .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted database URL]');
    logger.error('Restaurant SSR error:', error.name, error.code || 'UNKNOWN', message);
    if (res.headersSent) return res.end();
    res.status(500).render('error', {
      title: 'Có lỗi xảy ra', status: 500,
      message: 'Máy chủ tạm thời không thể xử lý yêu cầu. Vui lòng thử lại sau.',
      back: '/dishes'
    });
  });

  return app;
}

module.exports = { createApp };
