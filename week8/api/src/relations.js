const { parseId, validate } = require('./validation');
const { servingsPossible } = require('./recipe');

const dishInclude = {
  ingredients: { include: { ingredient: true }, orderBy: { ingredientId: 'asc' } },
  chefs: { include: { chef: true }, orderBy: { chefId: 'asc' } }
};
const chefInclude = { dishes: { include: { dish: true }, orderBy: { dishId: 'asc' } } };
function viewRecord(resource, record) {
  if (resource !== 'dishes') return record;
  return { ...record, servings: servingsPossible((record.ingredients || []).map((line) => ({ amount: line.amount, stock: line.ingredient.stock }))) };
}
class BusinessError extends Error {
  constructor(fields, code = 'VALIDATION_FAILED') {
    super(code === 'NOT_FOUND' ? 'Bản ghi không tồn tại.' : 'Dữ liệu không hợp lệ.');
    this.fields = fields;
    this.code = code;
  }
}
const positiveInt = (value) => Number.isInteger(value) && value >= 1 && value <= 2147483647;

// Validate the whole recipe first. New inventory items and links are then created
// inside the same transaction as the dish, so failure cannot leave half a dish.
async function recipeData(tx, lines, { single = false } = {}) {
  const fields = {};
  if (!Array.isArray(lines) || lines.length > 50) throw new BusinessError({ ingredients: 'Công thức phải là danh sách, tối đa 50 nguyên liệu.' });
  const seen = new Set();
  const prepared = [];
  for (const [index, line] of lines.entries()) {
    const key = (field) => single ? field : `ingredients.${index}.${field}`;
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      fields[key('ingredientId')] = 'Chọn nguyên liệu hoặc tạo nguyên liệu mới.';
      continue;
    }
    if (!positiveInt(line.amount)) fields[key('amount')] = 'Lượng dùng cho một phần phải là số nguyên từ 1 trở lên.';
    if (Object.hasOwn(line, 'ingredient') && Object.hasOwn(line, 'ingredientId')) {
      fields[key('ingredientId')] = 'Chỉ chọn nguyên liệu có sẵn hoặc tạo mới, không chọn cả hai.';
    } else if (Object.hasOwn(line, 'ingredient')) {
      const result = validate('ingredients', line.ingredient);
      for (const [field, message] of Object.entries(result.fields)) fields[key('ingredient.' + field)] = message;
      const identity = 'new:' + (result.data.name || '').toLocaleLowerCase('vi');
      if (seen.has(identity)) fields[key('ingredient.name')] = 'Nguyên liệu mới này đã có trong công thức.';
      seen.add(identity);
      prepared.push({ amount: line.amount, ingredient: { create: result.data } });
    } else {
      if (!positiveInt(line.ingredientId)) fields[key('ingredientId')] = 'Chọn một nguyên liệu hợp lệ.';
      else if (seen.has(line.ingredientId)) fields[key('ingredientId')] = 'Nguyên liệu này đã có trong công thức.';
      seen.add(line.ingredientId);
      prepared.push({ amount: line.amount, ingredient: { connect: { id: line.ingredientId } } });
    }
  }
  if (Object.keys(fields).length) throw new BusinessError(fields);
  const ids = lines.filter((line) => Object.hasOwn(line, 'ingredientId')).map((line) => line.ingredientId);
  if (ids.length) {
    const existing = await tx.ingredient.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const found = new Set(existing.map((item) => item.id));
    lines.forEach((line, index) => {
      if (Object.hasOwn(line, 'ingredientId') && !found.has(line.ingredientId)) fields[single ? 'ingredientId' : `ingredients.${index}.ingredientId`] = 'Nguyên liệu không tồn tại hoặc đã bị xóa.';
    });
  }
  if (Object.keys(fields).length) throw new BusinessError(fields);
  return prepared;
}

function registerRelations(app, { prisma, route, success, notFound }) {
  app.get('/api/dishes/:id/ingredients', route(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    const dish = await prisma.dish.findUnique({ where: { id }, include: dishInclude });
    return dish ? success(res, dish.ingredients) : notFound(res);
  }));
  app.get('/api/dishes/:id/ingredients/:ingredientId', route(async (req, res) => {
    const dishId = parseId(req.params.id), ingredientId = parseId(req.params.ingredientId);
    if (dishId === null || ingredientId === null) return notFound(res);
    const line = await prisma.dishIngredient.findUnique({ where: { dishId_ingredientId: { dishId, ingredientId } }, include: { ingredient: true, dish: true } });
    return line ? success(res, line) : notFound(res);
  }));
  app.post('/api/dishes/:id/ingredients', route(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    const record = await prisma.$transaction(async (tx) => {
      if (!await tx.dish.findUnique({ where: { id } })) throw new BusinessError(undefined, 'NOT_FOUND');
      const [line] = await recipeData(tx, [req.body], { single: true });
      if (req.body.ingredientId && await tx.dishIngredient.findUnique({ where: { dishId_ingredientId: { dishId: id, ingredientId: req.body.ingredientId } } })) {
        throw new BusinessError({ ingredientId: 'Nguyên liệu này đã có trong công thức.' });
      }
      return tx.dish.update({ where: { id }, data: { ingredients: { create: [line] } }, include: dishInclude });
    });
    return success(res, viewRecord('dishes', record));
  }));
  app.patch('/api/dishes/:id/ingredients/:ingredientId', route(async (req, res) => {
    const dishId = parseId(req.params.id), ingredientId = parseId(req.params.ingredientId);
    if (dishId === null || ingredientId === null) return notFound(res);
    if (!positiveInt(req.body?.amount)) throw new BusinessError({ amount: 'Lượng dùng cho một phần phải là số nguyên từ 1 trở lên.' });
    const line = await prisma.dishIngredient.update({
      where: { dishId_ingredientId: { dishId, ingredientId } }, data: { amount: req.body.amount }, include: { ingredient: true, dish: true }
    });
    return success(res, line);
  }));
  app.delete('/api/dishes/:id/ingredients/:ingredientId', route(async (req, res) => {
    const dishId = parseId(req.params.id), ingredientId = parseId(req.params.ingredientId);
    if (dishId === null || ingredientId === null) return notFound(res);
    await prisma.dishIngredient.delete({ where: { dishId_ingredientId: { dishId, ingredientId } } });
    return success(res, null);
  }));
  app.get('/api/chefs/:id/dishes', route(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    const chef = await prisma.chef.findUnique({ where: { id }, include: chefInclude });
    return chef ? success(res, chef.dishes) : notFound(res);
  }));
  app.get('/api/chefs/:id/dishes/:dishId', route(async (req, res) => {
    const chefId = parseId(req.params.id), dishId = parseId(req.params.dishId);
    if (chefId === null || dishId === null) return notFound(res);
    const row = await prisma.chefDish.findUnique({ where: { chefId_dishId: { chefId, dishId } }, include: { chef: true, dish: true } });
    return row ? success(res, row) : notFound(res);
  }));
  app.post('/api/chefs/:id/dishes', route(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    if (!positiveInt(req.body?.dishId)) throw new BusinessError({ dishId: 'Chọn một món ăn hợp lệ.' });
    const result = await prisma.$transaction(async (tx) => {
      if (!await tx.chef.findUnique({ where: { id } })) throw new BusinessError(undefined, 'NOT_FOUND');
      if (!await tx.dish.findUnique({ where: { id: req.body.dishId } })) throw new BusinessError({ dishId: 'Món ăn không tồn tại.' });
      if (await tx.chefDish.findUnique({ where: { chefId_dishId: { chefId: id, dishId: req.body.dishId } } })) throw new BusinessError({ dishId: 'Món này đã được gán cho đầu bếp.' });
      return tx.chefDish.create({ data: { chefId: id, dishId: req.body.dishId }, include: { dish: true, chef: true } });
    });
    return success(res, result);
  }));
  app.delete('/api/chefs/:id/dishes/:dishId', route(async (req, res) => {
    const chefId = parseId(req.params.id), dishId = parseId(req.params.dishId);
    if (chefId === null || dishId === null) return notFound(res);
    await prisma.chefDish.delete({ where: { chefId_dishId: { chefId, dishId } } });
    return success(res, null);
  }));
}
module.exports = { dishInclude, chefInclude, viewRecord, recipeData, BusinessError, registerRelations };
