const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createApp } = require('../src/app');
const { servingsPossible } = require('../src/recipe');

function sortRows(rows, orderBy = {}) {
  const [[key, dir] = []] = Object.entries(orderBy);
  if (!key) return [...rows];
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left < right) return dir === 'desc' ? 1 : -1;
    if (left > right) return dir === 'desc' ? -1 : 1;
    return 0;
  });
}

function fakePrisma() {
  const tables = {
    dish: [],
    chef: [],
    ingredient: [],
    dishIngredient: [],
    chefDish: []
  };

  function crud(name) {
    const rows = tables[name];
    return {
      async findMany({ where = {}, orderBy = {} } = {}) {
        const query = where.name?.contains?.toLocaleLowerCase('vi');
        const filtered = rows.filter((row) => (
          (!query || row.name.toLocaleLowerCase('vi').includes(query))
          && (!where.category || row.category === where.category)
        ));
        return sortRows(filtered, orderBy);
      },
      async findUnique({ where, include } = {}) {
        let row = null;
        if (where.id != null) row = rows.find((item) => item.id === where.id) || null;
        if (!row) return null;
        if (!include) return { ...row };
        const result = { ...row };
        if (include.ingredients) {
          const links = tables.dishIngredient.filter((link) => link.dishId === row.id);
          result.ingredients = sortRows(links, include.ingredients.orderBy || {}).map((link) => ({
            ...link,
            ingredient: include.ingredients.include?.ingredient
              ? tables.ingredient.find((item) => item.id === link.ingredientId)
              : undefined
          }));
        }
        if (include.dishes) {
          const links = tables.chefDish.filter((link) => link.chefId === row.id);
          result.dishes = sortRows(links, include.dishes.orderBy || {}).map((link) => ({
            ...link,
            dish: include.dishes.include?.dish
              ? tables.dish.find((item) => item.id === link.dishId)
              : undefined
          }));
        }
        return result;
      },
      async create({ data }) {
        const row = { id: Math.max(0, ...rows.map((item) => item.id)) + 1, ...data, createdAt: new Date() };
        rows.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = rows.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      async delete({ where }) {
        const index = rows.findIndex((row) => row.id === where.id);
        return rows.splice(index, 1)[0];
      }
    };
  }

  function joinTable(name, leftKey, rightKey, compound) {
    const rows = tables[name];
    return {
      async findUnique({ where, include } = {}) {
        const pair = where[compound];
        const row = rows.find((item) => item[leftKey] === pair[leftKey] && item[rightKey] === pair[rightKey]) || null;
        if (!row) return null;
        const result = { ...row };
        if (include?.dish) result.dish = tables.dish.find((item) => item.id === row.dishId);
        if (include?.ingredient) result.ingredient = tables.ingredient.find((item) => item.id === row.ingredientId);
        if (include?.chef) result.chef = tables.chef.find((item) => item.id === row.chefId);
        return result;
      },
      async create({ data }) {
        rows.push({ ...data });
        return data;
      },
      async update({ where, data }) {
        const pair = where[compound];
        const row = rows.find((item) => item[leftKey] === pair[leftKey] && item[rightKey] === pair[rightKey]);
        Object.assign(row, data);
        return row;
      },
      async delete({ where }) {
        const pair = where[compound];
        const index = rows.findIndex((item) => item[leftKey] === pair[leftKey] && item[rightKey] === pair[rightKey]);
        return rows.splice(index, 1)[0];
      }
    };
  }

  const client = {
    dish: crud('dish'),
    chef: crud('chef'),
    ingredient: crud('ingredient'),
    dishIngredient: joinTable('dishIngredient', 'dishId', 'ingredientId', 'dishId_ingredientId'),
    chefDish: joinTable('chefDish', 'chefId', 'dishId', 'chefId_dishId')
  };
  return { client, tables };
}

async function withApp(callback) {
  const { client, tables } = fakePrisma();
  const server = createApp({ prisma: client, logger: { error() {} } }).listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
    await callback({ request, tables, client });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const form = (data) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(data)
});

test('servingsPossible uses the tightest ingredient limit', () => {
  assert.equal(servingsPossible([]), 0);
  assert.equal(servingsPossible([{ amount: 10, stock: 100 }, { amount: 200, stock: 500 }]), 2);
  assert.equal(servingsPossible([{ amount: 10, stock: 9 }]), 0);
});

test('SSR public pages read current data; search, escaping and 404 work', async () => {
  await withApp(async ({ request, tables }) => {
    tables.dish.push({ id: 1, name: 'Matcha <b>Latte</b>', description: 'Nóng', price: 65000, category: 'matcha', image: '/beverages/matcha-latte.jpeg', available: true });
    const list = await request('/dishes');
    assert.equal(list.status, 200);
    const listHtml = await list.text();
    assert.match(listHtml, /Matcha &lt;b&gt;Latte&lt;\/b&gt;/);
    assert.match(listHtml, /\/beverages\/matcha-latte\.jpeg/);
    const search = await request('/dishes?q=MATCHA&category=matcha&sort=price-asc');
    assert.equal(search.status, 200);
    assert.match(await search.text(), /65000|65\.000/);
    const noResults = await request('/dishes?q=khongco');
    assert.match(await noResults.text(), /Không tìm thấy món trà phù hợp/);
    const detail = await request('/dishes/1');
    assert.match(await detail.text(), /Matcha/);
    assert.equal((await request('/dishes/abc')).status, 404);
    assert.equal((await request('/dishes/999')).status, 404);
  });
});

test('dish create validates, redirects after write and refresh does not duplicate', async () => {
  await withApp(async ({ request, tables }) => {
    const bad = await request('/admin/dishes', form({ name: 'Bún riêu', price: '-2' }));
    assert.equal(bad.status, 400);
    assert.match(await bad.text(), /Bún riêu/);
    assert.equal(tables.dish.length, 0);
    const saved = await request('/admin/dishes', form({ name: 'Bún riêu', price: '48000', category: 'Món chính', available: 'on' }));
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.get('location'), '/dishes/1');
    assert.equal(tables.dish[0].price, 48000);
    const result = await request(saved.headers.get('location'));
    assert.match(await result.text(), /Bún riêu/);
    await request(saved.headers.get('location'));
    assert.equal(tables.dish.length, 1);
  });
});

test('PATCH and DELETE forms apply to every resource only after confirmation flow', async () => {
  await withApp(async ({ request, tables }) => {
    for (const [resource, model, create, update] of [
      ['dishes', 'dish', { name: 'Cháo', price: '30000', available: 'on' }, { name: 'Cháo mới', price: '32000' }],
      ['chefs', 'chef', { name: 'Hà', specialty: 'Món Việt' }, { name: 'Hà mới', specialty: 'Món Á' }],
      ['ingredients', 'ingredient', { name: 'Rau', unit: 'kg', stock: '12' }, { name: 'Rau mới', unit: 'bó', stock: '8' }]
    ]) {
      const base = `/admin/${resource}`;
      assert.equal((await request(base)).status, 200);
      assert.equal((await request(`${base}/new`)).status, 200);
      assert.equal((await request(base, form(create))).status, 303);
      assert.equal(tables[model].length, 1);
      assert.equal((await request(`${base}/1/edit`)).status, 200);
      const patch = await request(`${base}/1?_method=PATCH`, form(update));
      assert.equal(patch.status, 303);
      assert.equal(tables[model][0].name, update.name);
      if (model === 'ingredient') assert.equal(tables[model][0].stock, Number(update.stock));
      const confirm = await request(`${base}/1/delete`);
      assert.equal(confirm.status, 200);
      assert.equal(tables[model].length, 1);
      const deleted = await request(`${base}/1?_method=DELETE`, form({}));
      assert.equal(deleted.status, 303);
      assert.equal(tables[model].length, 0);
      assert.equal((await request(`${base}/1/edit`)).status, 404);
    }
  });
});

test('dish recipe add shows servings; edit amount and delete from edit page', async () => {
  await withApp(async ({ request, tables }) => {
    tables.dish.push({
      id: 1,
      name: 'Matcha Latte',
      description: 'Trà matcha với sữa',
      price: 30000,
      category: 'matcha',
      image: '/beverages/matcha-latte.jpeg',
      available: true
    });
    tables.ingredient.push({ id: 1, name: 'Bột matcha', unit: 'g', stock: 100 });
    tables.ingredient.push({ id: 2, name: 'Sữa tươi', unit: 'ml', stock: 500 });

    const empty = await request('/admin/dishes/1');
    assert.equal(empty.status, 200);
    const emptyHtml = await empty.text();
    assert.match(emptyHtml, /Có thể làm <strong>0<\/strong> phần/);
    assert.match(emptyHtml, /Trà matcha với sữa/);
    assert.doesNotMatch(emptyHtml, /dữ liệu đọc lại từ database/);

    const bad = await request('/admin/dishes/1/ingredients', form({ ingredientId: '1', amount: '0' }));
    assert.equal(bad.status, 400);
    assert.equal(tables.dishIngredient.length, 0);

    const addPowder = await request('/admin/dishes/1/ingredients', form({ ingredientId: '1', amount: '10' }));
    assert.equal(addPowder.status, 303);
    assert.equal(addPowder.headers.get('location'), '/admin/dishes/1');
    assert.equal(tables.dishIngredient.length, 1);

    const addMilk = await request('/admin/dishes/1/ingredients', form({ ingredientId: '2', amount: '200' }));
    assert.equal(addMilk.status, 303);

    const detail = await request('/admin/dishes/1');
    const html = await detail.text();
    assert.match(html, /Có thể làm <strong>2<\/strong> phần/);
    assert.match(html, /10g/);
    assert.match(html, /200ml/);
    assert.match(html, /Chỉnh sửa/);

    const editPage = await request('/admin/dishes/1/ingredients/1/edit');
    assert.equal(editPage.status, 200);
    assert.match(await editPage.text(), /Lưu số lượng/);

    const patched = await request('/admin/dishes/1/ingredients/1?_method=PATCH', form({ amount: '20' }));
    assert.equal(patched.status, 303);
    assert.equal(tables.dishIngredient.find((row) => row.ingredientId === 1).amount, 20);

    const afterEdit = await request('/admin/dishes/1');
    assert.match(await afterEdit.text(), /Có thể làm <strong>2<\/strong> phần/);

    const confirm = await request('/admin/dishes/1/ingredients/1/delete');
    assert.equal(confirm.status, 200);
    assert.equal(tables.dishIngredient.length, 2);
    const removed = await request('/admin/dishes/1/ingredients/1?_method=DELETE', form({}));
    assert.equal(removed.status, 303);
    assert.equal(tables.dishIngredient.length, 1);
  });
});

test('chef dish assign and remove uses PRG and confirmation', async () => {
  await withApp(async ({ request, tables }) => {
    tables.chef.push({ id: 1, name: 'An', specialty: 'Matcha' });
    tables.dish.push({ id: 1, name: 'Matcha Latte', description: null, price: 30000, category: 'matcha', image: null, available: true });
    tables.dish.push({ id: 2, name: 'Houjicha Latte', description: null, price: 30000, category: 'houjicha', image: null, available: true });

    const page = await request('/admin/chefs/1');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Chưa gán món nào/);

    const assigned = await request('/admin/chefs/1/dishes', form({ dishId: '1' }));
    assert.equal(assigned.status, 303);
    assert.equal(assigned.headers.get('location'), '/admin/chefs/1');
    assert.equal(tables.chefDish.length, 1);

    const listed = await request('/admin/chefs/1');
    assert.match(await listed.text(), /Matcha Latte/);

    const confirm = await request('/admin/chefs/1/dishes/1/delete');
    assert.equal(confirm.status, 200);
    assert.equal(tables.chefDish.length, 1);
    const removed = await request('/admin/chefs/1/dishes/1?_method=DELETE', form({}));
    assert.equal(removed.status, 303);
    assert.equal(tables.chefDish.length, 0);
  });
});

test('database error returns a generic 500 without leaking connection details', async () => {
  const client = { dish: { async findMany() { throw new Error('postgresql://user:password@host/db is down'); } }, chef: {}, ingredient: {} };
  const server = createApp({ prisma: client, logger: { error() {} } }).listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/dishes`);
    const html = await response.text();
    assert.equal(response.status, 500);
    assert.doesNotMatch(html, /password|postgresql:\/\//);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
