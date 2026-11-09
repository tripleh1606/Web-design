const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers');
let app;
before(async () => { app = await fixture(); });
after(async () => { await app?.close(); });

test('Dish creation and partial update atomically save existing and inline new ingredients', async () => {
  const matcha = await app.prisma.ingredient.create({ data: { name: 'Bột matcha', unit: 'g', stock: 500 } });
  const created = await app.call('/api/dishes', { method: 'POST', data: { name: 'Công thức mới', price: 35000, ingredients: [
    { ingredientId: matcha.id, amount: 10 }, { ingredient: { name: 'Sữa tạo cùng món', unit: 'ml', stock: 1000 }, amount: 200 }
  ] } });
  assert.equal(created.status, 200);
  const dish = created.body.data;
  assert.equal(dish.ingredients.length, 2);
  assert.equal(dish.servings, 5);
  const milk = dish.ingredients.find((row) => row.ingredient.name === 'Sữa tạo cùng món').ingredient;
  const rename = await app.call('/api/dishes/' + dish.id, { method: 'PATCH', data: { name: 'Tên mới' } });
  assert.equal(rename.body.data.ingredients.length, 2);
  const edited = await app.call('/api/dishes/' + dish.id, { method: 'PATCH', data: { ingredients: [{ ingredientId: matcha.id, amount: 20 }] } });
  assert.equal(edited.body.data.name, 'Tên mới');
  assert.equal(edited.body.data.price, 35000);
  assert.equal(edited.body.data.servings, 25);
  assert.equal(edited.body.data.ingredients.length, 1);
  assert.ok(await app.prisma.ingredient.findUnique({ where: { id: milk.id } }));
  assert.equal((await app.prisma.ingredient.findUnique({ where: { id: matcha.id } })).stock, 500);
});

test('Invalid recipe, duplicate, missing reference and bad inline inventory leave no partial writes', async () => {
  const item = await app.prisma.ingredient.create({ data: { name: 'Nguyên tử', unit: 'g', stock: 100 } });
  const cases = [
    [{ ingredientId: item.id, amount: 0 }], [{ ingredientId: item.id, amount: '5' }],
    [{ ingredientId: item.id, amount: 1 }, { ingredientId: item.id, amount: 2 }],
    [{ ingredient: { name: '', unit: 'g', stock: 0 }, amount: 1 }],
    [{ ingredient: { name: 'Không được lưu', unit: 'g', stock: 10 }, amount: 1 }, { ingredientId: 99999, amount: 1 }],
    [{ ingredientId: item.id, ingredient: { name: 'X', unit: 'g' }, amount: 1 }], 'not-array', null
  ];
  for (const ingredients of cases) {
    const counts = [await app.prisma.dish.count(), await app.prisma.ingredient.count()];
    const result = await app.call('/api/dishes', { method: 'POST', data: { name: 'Không ghi', price: 0, ingredients } });
    assert.equal(result.status, 200);
    assert.equal(result.body.error.code, 'VALIDATION_FAILED');
    assert.ok(Object.keys(result.body.error.fields).length);
    assert.deepEqual([await app.prisma.dish.count(), await app.prisma.ingredient.count()], counts);
  }
  const dish = await app.prisma.dish.create({ data: { name: 'Giữ công thức', price: 1, ingredients: { create: { ingredientId: item.id, amount: 2 } } } });
  const result = await app.call('/api/dishes/' + dish.id, { method: 'PATCH', data: { name: 'Không đổi tên', ingredients: [{ ingredientId: 99999, amount: 1 }] } });
  assert.equal(result.body.error.code, 'VALIDATION_FAILED');
  const kept = (await app.call('/api/dishes/' + dish.id)).body.data;
  assert.equal(kept.name, 'Giữ công thức');
  assert.equal(kept.ingredients[0].amount, 2);
});

test('Recipe endpoints list/detail/add existing or new/edit/remove; removal keeps inventory', async () => {
  const dish = await app.prisma.dish.create({ data: { name: 'Món quan hệ', price: 40000 } });
  const item = await app.prisma.ingredient.create({ data: { name: 'Nước', unit: 'ml', stock: 1000 } });
  const base = `/api/dishes/${dish.id}/ingredients`;
  assert.deepEqual((await app.call(base)).body.data, []);
  assert.equal((await app.call(base, { method: 'POST', data: { ingredientId: item.id, amount: 100 } })).body.data.servings, 10);
  assert.equal((await app.call(base)).body.data.length, 1);
  assert.equal((await app.call(base + '/' + item.id)).body.data.amount, 100);
  assert.ok((await app.call(base, { method: 'POST', data: { ingredientId: item.id, amount: 100 } })).body.error.fields.ingredientId);
  const edit = await app.call(base + '/' + item.id, { method: 'PATCH', data: { amount: 250, ingredientId: 99999 } });
  assert.equal(edit.body.data.amount, 250);
  assert.equal(edit.body.data.ingredientId, item.id);
  assert.ok((await app.call(base + '/' + item.id, { method: 'PATCH', data: { amount: -1 } })).body.error.fields.amount);
  const added = await app.call(base, { method: 'POST', data: { ingredient: { name: 'Mật ong mới', unit: 'g', stock: 90 }, amount: 30 } });
  assert.equal(added.body.data.servings, 3);
  assert.deepEqual((await app.call(base + '/' + item.id, { method: 'DELETE' })).body, { ok: true, data: null });
  assert.equal((await app.call(base + '/' + item.id)).body.error.code, 'NOT_FOUND');
  assert.ok(await app.prisma.ingredient.findUnique({ where: { id: item.id } }));
  assert.equal((await app.call('/api/dishes/abc/ingredients')).body.error.code, 'NOT_FOUND');
  assert.equal((await app.call('/api/dishes/99999/ingredients')).body.error.code, 'NOT_FOUND');
});

test('Servings recalculates after stock update; deleting inventory cascades recipe and empty recipe means zero', async () => {
  const item = await app.prisma.ingredient.create({ data: { name: 'Sữa tồn kho', unit: 'ml', stock: 1000 } });
  const dish = await app.prisma.dish.create({ data: { name: 'Tính phần', price: 0, ingredients: { create: { ingredientId: item.id, amount: 200 } } } });
  assert.equal((await app.call('/api/dishes/' + dish.id)).body.data.servings, 5);
  await app.call('/api/ingredients/' + item.id, { method: 'PATCH', data: { stock: 399 } });
  assert.equal((await app.call('/api/dishes/' + dish.id)).body.data.servings, 1);
  await app.call('/api/ingredients/' + item.id, { method: 'DELETE' });
  const current = (await app.call('/api/dishes/' + dish.id)).body.data;
  assert.equal(current.servings, 0);
  assert.deepEqual(current.ingredients, []);
});

test('Chef assignment APIs prevent duplicates; unlink keeps both parent records', async () => {
  const chef = await app.prisma.chef.create({ data: { name: 'Bếp quan hệ', specialty: 'Trà' } });
  const dish = await app.prisma.dish.create({ data: { name: 'Món đầu bếp', price: 0 } });
  const base = `/api/chefs/${chef.id}/dishes`;
  assert.deepEqual((await app.call(base)).body.data, []);
  assert.equal((await app.call(base, { method: 'POST', data: { dishId: dish.id } })).body.data.dish.name, dish.name);
  assert.equal((await app.call(base)).body.data.length, 1);
  assert.equal((await app.call(base + '/' + dish.id)).body.data.chef.name, chef.name);
  assert.equal((await app.call('/api/chefs/' + chef.id)).body.data.dishes.length, 1);
  assert.equal((await app.call('/api/dishes/' + dish.id)).body.data.chefs.length, 1);
  for (const dishId of [dish.id, 'abc', 999999]) {
    const result = await app.call(base, { method: 'POST', data: { dishId } });
    assert.equal(result.body.error.code, 'VALIDATION_FAILED');
    assert.ok(result.body.error.fields.dishId);
  }
  assert.deepEqual((await app.call(base + '/' + dish.id, { method: 'DELETE' })).body, { ok: true, data: null });
  assert.ok(await app.prisma.dish.findUnique({ where: { id: dish.id } }));
  assert.ok(await app.prisma.chef.findUnique({ where: { id: chef.id } }));
  assert.equal((await app.call(base + '/' + dish.id)).body.error.code, 'NOT_FOUND');
});

test('Week-3 category and price sort work together with q', async () => {
  for (const price of [90000, 10000, 50000]) await app.prisma.dish.create({ data: { name: 'Sort sample ' + price, price, category: 'houjicha' } });
  assert.deepEqual((await app.call('/api/dishes?q=Sort%20sample&category=houjicha&sort=price-asc')).body.data.map((row) => row.price), [10000, 50000, 90000]);
  assert.deepEqual((await app.call('/api/dishes?q=Sort%20sample&sort=price-desc')).body.data.map((row) => row.price), [90000, 50000, 10000]);
  assert.deepEqual((await app.call('/api/dishes?q=Sort%20sample&category=matcha')).body.data, []);
});
