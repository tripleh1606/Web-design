const path = require('node:path');
const express = require('express');
const methodOverride = require('method-override');
const { resources, parseId, validate, valuesFromRecord } = require('./validation');
const { categories, categoryLabel, formatVND } = require('./soucha-menu');
const { servingsPossible } = require('./recipe');

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function parsePositiveInt(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n <= 2147483647 ? n : null;
}

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

  async function renderDishDetail(res, dishId, { values = {}, errors = {}, status = 200 } = {}) {
    const dish = await prisma.dish.findUnique({
      where: { id: dishId },
      include: {
        ingredients: {
          include: { ingredient: true },
          orderBy: { ingredientId: 'asc' }
        }
      }
    });
    if (!dish) return notFound(res, '/admin/dishes');
    const recipe = dish.ingredients;
    const linkedIds = new Set(recipe.map((row) => row.ingredientId));
    const allIngredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
    const availableIngredients = allIngredients.filter((item) => !linkedIds.has(item.id));
    // Recalculate from the full recipe every render (including after add/remove + 303).
    const servings = servingsPossible(recipe.map((row) => ({
      amount: row.amount,
      stock: row.ingredient.stock
    })));
    return res.status(status).render('admin/dish-detail', {
      title: `Công thức · ${dish.name}`,
      dish,
      recipe,
      servings,
      availableIngredients,
      values,
      errors
    });
  }

  app.get('/admin/dishes/:id', asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, '/admin/dishes');
    return renderDishDetail(res, id);
  }));

  app.post('/admin/dishes/:id/ingredients', asyncRoute(async (req, res) => {
    const dishId = parseId(req.params.id);
    if (dishId === null) return notFound(res, '/admin/dishes');
    const dish = await prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish) return notFound(res, '/admin/dishes');

    const ingredientIdRaw = typeof req.body?.ingredientId === 'string' ? req.body.ingredientId.trim() : '';
    const amountRaw = typeof req.body?.amount === 'string' ? req.body.amount.trim() : '';
    const values = { ingredientId: ingredientIdRaw, amount: amountRaw };
    const errors = {};
    const ingredientId = parsePositiveInt(ingredientIdRaw);
    const amount = parsePositiveInt(amountRaw);

    if (ingredientId === null) errors.ingredientId = 'Chọn một nguyên liệu hợp lệ.';
    if (amount === null) errors.amount = 'Lượng cần phải là số nguyên từ 1 trở lên.';

    if (ingredientId !== null) {
      const ingredient = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
      if (!ingredient) errors.ingredientId = 'Nguyên liệu không tồn tại.';
      else {
        const linked = await prisma.dishIngredient.findUnique({
          where: { dishId_ingredientId: { dishId, ingredientId } }
        });
        if (linked) errors.ingredientId = 'Nguyên liệu này đã có trong công thức.';
      }
    }

    if (Object.keys(errors).length) {
      return renderDishDetail(res, dishId, { values, errors, status: 400 });
    }

    await prisma.dishIngredient.create({ data: { dishId, ingredientId, amount } });
    res.redirect(303, `/admin/dishes/${dishId}`);
  }));

  app.get('/admin/dishes/:id/ingredients/:ingredientId/edit', asyncRoute(async (req, res) => {
    const dishId = parseId(req.params.id);
    const ingredientId = parseId(req.params.ingredientId);
    if (dishId === null || ingredientId === null) return notFound(res, '/admin/dishes');
    const link = await prisma.dishIngredient.findUnique({
      where: { dishId_ingredientId: { dishId, ingredientId } },
      include: { dish: true, ingredient: true }
    });
    if (!link) return notFound(res, `/admin/dishes/${dishId}`);
    res.render('admin/dish-ingredient-edit', {
      title: `Sửa · ${link.ingredient.name}`,
      dish: link.dish,
      ingredient: link.ingredient,
      values: { amount: String(link.amount) },
      errors: {}
    });
  }));

  app.patch('/admin/dishes/:id/ingredients/:ingredientId', asyncRoute(async (req, res) => {
    const dishId = parseId(req.params.id);
    const ingredientId = parseId(req.params.ingredientId);
    if (dishId === null || ingredientId === null) return notFound(res, '/admin/dishes');
    const link = await prisma.dishIngredient.findUnique({
      where: { dishId_ingredientId: { dishId, ingredientId } },
      include: { dish: true, ingredient: true }
    });
    if (!link) return notFound(res, `/admin/dishes/${dishId}`);

    const amountRaw = typeof req.body?.amount === 'string' ? req.body.amount.trim() : '';
    const values = { amount: amountRaw };
    const errors = {};
    const amount = parsePositiveInt(amountRaw);
    if (amount === null) errors.amount = 'Lượng cần phải là số nguyên từ 1 trở lên.';

    if (Object.keys(errors).length) {
      return res.status(400).render('admin/dish-ingredient-edit', {
        title: `Sửa · ${link.ingredient.name}`,
        dish: link.dish,
        ingredient: link.ingredient,
        values,
        errors
      });
    }

    await prisma.dishIngredient.update({
      where: { dishId_ingredientId: { dishId, ingredientId } },
      data: { amount }
    });
    res.redirect(303, `/admin/dishes/${dishId}`);
  }));

  app.get('/admin/dishes/:id/ingredients/:ingredientId/delete', asyncRoute(async (req, res) => {
    const dishId = parseId(req.params.id);
    const ingredientId = parseId(req.params.ingredientId);
    if (dishId === null || ingredientId === null) return notFound(res, '/admin/dishes');
    const link = await prisma.dishIngredient.findUnique({
      where: { dishId_ingredientId: { dishId, ingredientId } },
      include: { dish: true, ingredient: true }
    });
    if (!link) return notFound(res, `/admin/dishes/${dishId}`);
    res.render('admin/unlink', {
      title: 'Gỡ nguyên liệu',
      backHref: `/admin/dishes/${dishId}/ingredients/${ingredientId}/edit`,
      backLabel: 'Chỉnh sửa',
      heading: 'Gỡ nguyên liệu khỏi công thức?',
      message: `Bạn sắp gỡ “${link.ingredient.name}” khỏi món “${link.dish.name}”. Chỉ khi bấm xác nhận bên dưới, liên kết mới bị xóa.`,
      action: `/admin/dishes/${dishId}/ingredients/${ingredientId}?_method=DELETE`,
      cancelHref: `/admin/dishes/${dishId}/ingredients/${ingredientId}/edit`
    });
  }));

  app.delete('/admin/dishes/:id/ingredients/:ingredientId', asyncRoute(async (req, res) => {
    const dishId = parseId(req.params.id);
    const ingredientId = parseId(req.params.ingredientId);
    if (dishId === null || ingredientId === null) return notFound(res, '/admin/dishes');
    const link = await prisma.dishIngredient.findUnique({
      where: { dishId_ingredientId: { dishId, ingredientId } }
    });
    if (!link) return notFound(res, `/admin/dishes/${dishId}`);
    await prisma.dishIngredient.delete({
      where: { dishId_ingredientId: { dishId, ingredientId } }
    });
    res.redirect(303, `/admin/dishes/${dishId}`);
  }));

  async function renderChefDetail(res, chefId, { values = {}, errors = {}, status = 200 } = {}) {
    const chef = await prisma.chef.findUnique({
      where: { id: chefId },
      include: {
        dishes: {
          include: { dish: true },
          orderBy: { dishId: 'asc' }
        }
      }
    });
    if (!chef) return notFound(res, '/admin/chefs');
    const assignedIds = new Set(chef.dishes.map((row) => row.dishId));
    const allDishes = await prisma.dish.findMany({ orderBy: { name: 'asc' } });
    const availableDishes = allDishes.filter((item) => !assignedIds.has(item.id));
    return res.status(status).render('admin/chef-detail', {
      title: `Món · ${chef.name}`,
      chef,
      assigned: chef.dishes,
      availableDishes,
      values,
      errors
    });
  }

  app.get('/admin/chefs/:id', asyncRoute(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, '/admin/chefs');
    return renderChefDetail(res, id);
  }));

  app.post('/admin/chefs/:id/dishes', asyncRoute(async (req, res) => {
    const chefId = parseId(req.params.id);
    if (chefId === null) return notFound(res, '/admin/chefs');
    const chef = await prisma.chef.findUnique({ where: { id: chefId } });
    if (!chef) return notFound(res, '/admin/chefs');

    const dishIdRaw = typeof req.body?.dishId === 'string' ? req.body.dishId.trim() : '';
    const values = { dishId: dishIdRaw };
    const errors = {};
    const dishId = parsePositiveInt(dishIdRaw);

    if (dishId === null) errors.dishId = 'Chọn một món hợp lệ.';
    else {
      const dish = await prisma.dish.findUnique({ where: { id: dishId } });
      if (!dish) errors.dishId = 'Món ăn không tồn tại.';
      else {
        const linked = await prisma.chefDish.findUnique({
          where: { chefId_dishId: { chefId, dishId } }
        });
        if (linked) errors.dishId = 'Món này đã được gán cho đầu bếp.';
      }
    }

    if (Object.keys(errors).length) {
      return renderChefDetail(res, chefId, { values, errors, status: 400 });
    }

    await prisma.chefDish.create({ data: { chefId, dishId } });
    res.redirect(303, `/admin/chefs/${chefId}`);
  }));

  app.get('/admin/chefs/:id/dishes/:dishId/delete', asyncRoute(async (req, res) => {
    const chefId = parseId(req.params.id);
    const dishId = parseId(req.params.dishId);
    if (chefId === null || dishId === null) return notFound(res, '/admin/chefs');
    const link = await prisma.chefDish.findUnique({
      where: { chefId_dishId: { chefId, dishId } },
      include: { chef: true, dish: true }
    });
    if (!link) return notFound(res, `/admin/chefs/${chefId}`);
    res.render('admin/unlink', {
      title: 'Gỡ món',
      backHref: `/admin/chefs/${chefId}`,
      backLabel: link.chef.name,
      heading: 'Gỡ món khỏi đầu bếp?',
      message: `Bạn sắp gỡ “${link.dish.name}” khỏi đầu bếp “${link.chef.name}”. Chỉ khi bấm xác nhận bên dưới, liên kết mới bị xóa.`,
      action: `/admin/chefs/${chefId}/dishes/${dishId}?_method=DELETE`,
      cancelHref: `/admin/chefs/${chefId}`
    });
  }));

  app.delete('/admin/chefs/:id/dishes/:dishId', asyncRoute(async (req, res) => {
    const chefId = parseId(req.params.id);
    const dishId = parseId(req.params.dishId);
    if (chefId === null || dishId === null) return notFound(res, '/admin/chefs');
    const link = await prisma.chefDish.findUnique({
      where: { chefId_dishId: { chefId, dishId } }
    });
    if (!link) return notFound(res, `/admin/chefs/${chefId}`);
    await prisma.chefDish.delete({
      where: { chefId_dishId: { chefId, dishId } }
    });
    res.redirect(303, `/admin/chefs/${chefId}`);
  }));

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
