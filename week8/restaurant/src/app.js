const express = require('express');
const { resources, parseId, validate } = require('./validation');
const { servingsPossible } = require('./recipe');

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function createApp({ prisma, logger = console, corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173' } = {}) {
  if (!prisma) throw new Error('A Prisma client is required.');

  const allowedOrigin = String(corsOrigin || '').replace(/\/$/, '');
  const app = express();
  app.disable('x-powered-by');

  // Business codes stay HTTP 200. Technical failures do not use { ok }.
  const ok = (res, data) => res.status(200).json({ ok: true, data });
  const fail = (res, code, message, fields) => {
    logger.error('Restaurant API business:', code);
    const error = { code, message };
    if (fields && Object.keys(fields).length) error.fields = fields;
    return res.status(200).json({ ok: false, error });
  };
  const notFound = (res) => fail(res, 'NOT_FOUND', 'Không có bản ghi');
  const validationFailed = (res, errors) => fail(res, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ', errors);

  app.use((req, res, next) => {
    const requestOrigin = req.get('Origin');
    if (allowedOrigin && allowedOrigin !== '*' && requestOrigin === allowedOrigin) {
      res.set('Access-Control-Allow-Origin', allowedOrigin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  app.use(express.json({ limit: '32kb' }));

  function queryText(value) {
    return typeof value === 'string' ? value.trim().slice(0, 120) : '';
  }

  function positiveInt(value) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) return null;
    return value;
  }

  for (const [resource, config] of Object.entries(resources)) {
    const base = `/api/${resource}`;
    const model = prisma[config.model];

    app.get(base, asyncRoute(async (req, res) => {
      if (resource !== 'dishes') {
        return ok(res, await model.findMany({ orderBy: { id: 'desc' } }));
      }
      const q = queryText(req.query.q);
      const category = queryText(req.query.category);
      const sort = typeof req.query.sort === 'string' ? req.query.sort : '';
      const where = {
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        ...(category ? { category } : {})
      };
      const orderBy = sort === 'price-asc' ? { price: 'asc' }
        : sort === 'price-desc' ? { price: 'desc' }
          : sort === 'newest' ? { id: 'desc' }
            : { id: 'asc' };
      return ok(res, await model.findMany({ where, orderBy }));
    }));

    app.get(`${base}/:id`, asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res);
      const row = await model.findUnique({ where: { id } });
      if (!row) return notFound(res);
      return ok(res, row);
    }));

    app.post(base, asyncRoute(async (req, res) => {
      const result = validate(resource, req.body);
      if (!result.valid) return validationFailed(res, result.errors);
      return ok(res, await model.create({ data: result.data }));
    }));

    app.patch(`${base}/:id`, asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res);
      const result = validate(resource, req.body, { partial: true });
      if (!result.valid) return validationFailed(res, result.errors);
      const row = await model.findUnique({ where: { id } });
      if (!row) return notFound(res);
      if (!Object.keys(result.data).length) return ok(res, row);
      return ok(res, await model.update({ where: { id }, data: result.data }));
    }));

    app.delete(`${base}/:id`, asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return notFound(res);
      const row = await model.findUnique({ where: { id } });
      if (!row) return notFound(res);
      await model.delete({ where: { id } });
      return ok(res, null);
    }));
  }

  app.get('/api/dishes/:id/recipe', asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    const found = await prisma.dish.findUnique({
      where: { id },
      include: {
        ingredients: {
          include: { ingredient: true },
          orderBy: { ingredientId: 'asc' }
        }
      }
    });
    if (!found) return notFound(res);
    const { ingredients, ...dish } = found;
    const linked = new Set(ingredients.map((row) => row.ingredientId));
    const allIngredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
    const servings = servingsPossible(ingredients.map((row) => ({
      amount: row.amount,
      stock: row.ingredient?.stock
    })));
    return ok(res, {
      dish,
      recipe: ingredients,
      servings,
      availableIngredients: allIngredients.filter((item) => !linked.has(item.id))
    });
  }));

  app.post('/api/dishes/:id/ingredients', asyncRoute(async (req, res) => {
    const dishId = parseId(req.params.id);
    if (dishId === null) return notFound(res);
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const ingredientId = positiveInt(body.ingredientId);
    const amount = positiveInt(body.amount);
    const errors = {};
    if (ingredientId === null) errors.ingredientId = 'Chọn một nguyên liệu hợp lệ.';
    if (amount === null) errors.amount = 'Lượng cần phải là số nguyên từ 1 trở lên.';
    if (Object.keys(errors).length) return validationFailed(res, errors);

    const dish = await prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish) return notFound(res);
    const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ingredient) return validationFailed(res, { ingredientId: 'Nguyên liệu không tồn tại.' });
    const linked = await prisma.dishIngredient.findUnique({
      where: { dishId_ingredientId: { dishId, ingredientId } }
    });
    if (linked) return validationFailed(res, { ingredientId: 'Nguyên liệu này đã có trong công thức.' });

    const created = await prisma.dishIngredient.create({ data: { dishId, ingredientId, amount } });
    return ok(res, created);
  }));

  app.patch('/api/dishes/:id/ingredients/:ingredientId', asyncRoute(async (req, res) => {
    const dishId = parseId(req.params.id);
    const ingredientId = parseId(req.params.ingredientId);
    if (dishId === null || ingredientId === null) return notFound(res);
    const amount = positiveInt(req.body?.amount);
    if (amount === null) return validationFailed(res, { amount: 'Lượng cần phải là số nguyên từ 1 trở lên.' });
    const link = await prisma.dishIngredient.findUnique({
      where: { dishId_ingredientId: { dishId, ingredientId } }
    });
    if (!link) return notFound(res);
    const updated = await prisma.dishIngredient.update({
      where: { dishId_ingredientId: { dishId, ingredientId } },
      data: { amount }
    });
    return ok(res, updated);
  }));

  app.delete('/api/dishes/:id/ingredients/:ingredientId', asyncRoute(async (req, res) => {
    const dishId = parseId(req.params.id);
    const ingredientId = parseId(req.params.ingredientId);
    if (dishId === null || ingredientId === null) return notFound(res);
    const link = await prisma.dishIngredient.findUnique({
      where: { dishId_ingredientId: { dishId, ingredientId } }
    });
    if (!link) return notFound(res);
    await prisma.dishIngredient.delete({ where: { dishId_ingredientId: { dishId, ingredientId } } });
    return ok(res, null);
  }));

  app.get('/api/chefs/:id/dishes', asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    const found = await prisma.chef.findUnique({
      where: { id },
      include: {
        dishes: {
          include: { dish: true },
          orderBy: { dishId: 'asc' }
        }
      }
    });
    if (!found) return notFound(res);
    const { dishes, ...chef } = found;
    const assignedIds = new Set(dishes.map((row) => row.dishId));
    const allDishes = await prisma.dish.findMany({ orderBy: { name: 'asc' } });
    return ok(res, {
      chef,
      assigned: dishes,
      availableDishes: allDishes.filter((item) => !assignedIds.has(item.id))
    });
  }));

  app.post('/api/chefs/:id/dishes', asyncRoute(async (req, res) => {
    const chefId = parseId(req.params.id);
    if (chefId === null) return notFound(res);
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const dishId = positiveInt(body.dishId);
    if (dishId === null) return validationFailed(res, { dishId: 'Chọn một món hợp lệ.' });

    const chef = await prisma.chef.findUnique({ where: { id: chefId } });
    if (!chef) return notFound(res);
    const dish = await prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish) return validationFailed(res, { dishId: 'Món ăn không tồn tại.' });
    const linked = await prisma.chefDish.findUnique({
      where: { chefId_dishId: { chefId, dishId } }
    });
    if (linked) return validationFailed(res, { dishId: 'Món này đã được gán cho đầu bếp.' });

    const created = await prisma.chefDish.create({ data: { chefId, dishId } });
    return ok(res, created);
  }));

  app.delete('/api/chefs/:id/dishes/:dishId', asyncRoute(async (req, res) => {
    const chefId = parseId(req.params.id);
    const dishId = parseId(req.params.dishId);
    if (chefId === null || dishId === null) return notFound(res);
    const link = await prisma.chefDish.findUnique({
      where: { chefId_dishId: { chefId, dishId } }
    });
    if (!link) return notFound(res);
    await prisma.chefDish.delete({ where: { chefId_dishId: { chefId, dishId } } });
    return ok(res, null);
  }));

  app.use((_req, res) => {
    res.status(404).type('text/plain').send('Not Found');
  });

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      const status = error.status || 400;
      return res.status(status).type('text/plain').send(status === 413 ? 'Payload Too Large' : 'Bad Request');
    }
    const secret = process.env.DATABASE_URL;
    const message = String(error.message || '').replaceAll(secret || '\0', '[redacted]')
      .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted database URL]');
    logger.error('Restaurant API error:', error.name, error.code || 'UNKNOWN', message);
    return res.status(500).type('text/plain').send('Internal Server Error');
  });

  return app;
}

module.exports = { createApp };
