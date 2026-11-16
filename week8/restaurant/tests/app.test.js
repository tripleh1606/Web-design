const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createApp } = require('../src/app');
const { servingsPossible } = require('../src/recipe');

const SPA_ORIGIN = 'http://localhost:5173';

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
  const server = createApp({
    prisma: client,
    logger: { error() {} },
    corsOrigin: SPA_ORIGIN
  }).listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (urlPath, options = {}) => fetch(base + urlPath, options);
    await callback({ request, tables });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function json(method, data, headers = {}) {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(data)
  };
}

test('servingsPossible uses the tightest ingredient limit', () => {
  assert.equal(servingsPossible([]), 0);
  assert.equal(servingsPossible([{ amount: 10, stock: 100 }, { amount: 200, stock: 500 }]), 2);
  assert.equal(servingsPossible([{ amount: 10, stock: 9 }]), 0);
});

test('dish list supports search, category and sort; empty list is success', async () => {
  await withApp(async ({ request, tables }) => {
    const empty = await request('/api/dishes');
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { ok: true, data: [] });
    tables.dish.push(
      { id: 1, name: 'Matcha <b>Latte</b>', description: 'Nóng', price: 65000, category: 'matcha', image: '/beverages/matcha-latte.jpeg', available: true },
      { id: 2, name: 'Houjicha Latte', description: null, price: 30000, category: 'houjicha', image: null, available: true }
    );
    const search = await request('/api/dishes?q=MATCHA&category=matcha&sort=price-asc');
    const body = await search.json();
    assert.equal(search.status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.data.map((dish) => dish.id), [1]);
    const sorted = await request('/api/dishes?sort=price-asc');
    assert.deepEqual((await sorted.json()).data.map((dish) => dish.price), [30000, 65000]);
    const none = await request('/api/dishes?q=khongco');
    assert.deepEqual((await none.json()).data, []);
  });
});

test('missing records are NOT_FOUND with HTTP 200; unknown URLs are plain 404', async () => {
  await withApp(async ({ request }) => {
    for (const urlPath of ['/api/dishes/999', '/api/dishes/abc', '/api/chefs/0', '/api/ingredients/1']) {
      const response = await request(urlPath, { headers: { Origin: SPA_ORIGIN } });
      const body = await response.json();
      assert.equal(response.status, 200, urlPath);
      assert.equal(body.ok, false);
      assert.equal(body.error.code, 'NOT_FOUND');
      assert.equal(body.error.fields, undefined);
      assert.equal(response.headers.get('access-control-allow-origin'), SPA_ORIGIN);
    }
    const missing = await request('/api/bok');
    assert.equal(missing.status, 404);
    assert.doesNotMatch(await missing.text(), /"ok"/);
  });
});

test('writes validate JSON types, ignore unknown fields, and support partial PATCH', async () => {
  await withApp(async ({ request, tables }) => {
    const bad = await request('/api/dishes', json('POST', { name: '', price: '48000', available: 'true', id: 99 }));
    assert.equal(bad.status, 200);
    const badBody = await bad.json();
    assert.equal(badBody.ok, false);
    assert.equal(badBody.error.code, 'VALIDATION_FAILED');
    assert.match(badBody.error.fields.name, /không được để trống/);
    assert.match(badBody.error.fields.price, /số nguyên/);
    assert.equal(tables.dish.length, 0);

    const saved = await request('/api/dishes', json('POST', {
      name: 'Bún riêu',
      description: '  Nóng  ',
      price: 48000,
      category: 'Món chính',
      image: '/beverages/matcha-latte.jpeg',
      available: true,
      id: 99,
      stock: 5
    }));
    const created = await saved.json();
    assert.equal(saved.status, 200);
    assert.equal(created.ok, true);
    assert.equal(created.data.id, 1);
    assert.equal(created.data.description, 'Nóng');
    assert.equal(tables.dish[0].id, 1);
    assert.equal(tables.dish[0].stock, undefined);

    const invalidPatch = await request('/api/dishes/999', json('PATCH', { price: -1 }));
    assert.equal((await invalidPatch.json()).error.code, 'VALIDATION_FAILED');
    const missingPatch = await request('/api/dishes/999', json('PATCH', { price: 1000 }));
    assert.equal((await missingPatch.json()).error.code, 'NOT_FOUND');

    const patched = await request('/api/dishes/1', json('PATCH', { price: 50000 }));
    const patchedBody = await patched.json();
    assert.equal(patchedBody.ok, true);
    assert.equal(patchedBody.data.name, 'Bún riêu');
    assert.equal(patchedBody.data.price, 50000);

    const removed = await request('/api/dishes/1', { method: 'DELETE' });
    assert.deepEqual(await removed.json(), { ok: true, data: null });
    assert.equal(tables.dish.length, 0);
    const again = await request('/api/dishes/1', { method: 'DELETE' });
    assert.equal((await again.json()).error.code, 'NOT_FOUND');
  });
});

test('chefs and ingredients use the same response contract', async () => {
  await withApp(async ({ request, tables }) => {
    const resources = [
      ['chefs', 'chef', { name: 'Hà', specialty: 'Món Việt' }, { specialty: 'Món Á' }],
      ['ingredients', 'ingredient', { name: 'Rau', unit: 'kg', stock: 12 }, { stock: 8 }]
    ];
    for (const [resource, model, create, patch] of resources) {
      const base = `/api/${resource}`;
      assert.equal((await (await request(base)).json()).ok, true);
      const created = await request(base, json('POST', create));
      assert.equal((await created.json()).ok, true);
      assert.equal(tables[model].length, 1);
      const updated = await request(`${base}/1`, json('PATCH', patch));
      assert.equal((await updated.json()).data.name, create.name);
      assert.equal((await request(`${base}/1`)).status, 200);
      const removed = await request(`${base}/1`, { method: 'DELETE' });
      assert.equal((await removed.json()).data, null);
      assert.equal(tables[model].length, 0);
    }
  });
});

test('CORS allows only the SPA origin and answers preflight', async () => {
  await withApp(async ({ request }) => {
    const okOrigin = await request('/api/dishes', { headers: { Origin: SPA_ORIGIN } });
    assert.equal(okOrigin.headers.get('access-control-allow-origin'), SPA_ORIGIN);
    assert.notEqual(okOrigin.headers.get('access-control-allow-origin'), '*');
    const denied = await request('/api/dishes', { headers: { Origin: 'http://evil.example' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const preflight = await request('/api/dishes/1', {
      method: 'OPTIONS',
      headers: {
        Origin: SPA_ORIGIN,
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-methods'), /PATCH/);
    assert.match(preflight.headers.get('access-control-allow-methods'), /DELETE/);
    assert.match(preflight.headers.get('access-control-allow-headers'), /content-type/i);
    assert.equal(preflight.headers.get('access-control-allow-origin'), SPA_ORIGIN);
  });
});

test('bad JSON is 400 and database failures are 500, neither uses ok', async () => {
  await withApp(async ({ request }) => {
    const bad = await request('/api/dishes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Origin: SPA_ORIGIN },
      body: '{bad'
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.headers.get('access-control-allow-origin'), SPA_ORIGIN);
    assert.doesNotMatch(await bad.text(), /"ok"/);
  });

  const { client } = fakePrisma();
  client.dish.findMany = async () => {
    throw new Error('postgresql://user:password@host/db is down');
  };
  const server = createApp({
    prisma: client,
    logger: { error() {} },
    corsOrigin: SPA_ORIGIN
  }).listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/dishes`, {
      headers: { Origin: SPA_ORIGIN }
    });
    const text = await response.text();
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('access-control-allow-origin'), SPA_ORIGIN);
    assert.doesNotMatch(text, /password|postgresql:\/\/|"ok"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('recipe and chef assignment keep the existing restaurant relations', async () => {
  await withApp(async ({ request, tables }) => {
    tables.dish.push({ id: 1, name: 'Matcha Latte', description: 'Trà matcha với sữa', price: 30000, category: 'matcha', image: '/beverages/matcha-latte.jpeg', available: true });
    tables.dish.push({ id: 2, name: 'Houjicha Latte', description: null, price: 30000, category: 'houjicha', image: null, available: true });
    tables.ingredient.push({ id: 1, name: 'Bột matcha', unit: 'g', stock: 100 });
    tables.ingredient.push({ id: 2, name: 'Sữa tươi', unit: 'ml', stock: 500 });
    tables.chef.push({ id: 1, name: 'An', specialty: 'Matcha' });

    const empty = await request('/api/dishes/1/recipe');
    assert.equal((await empty.json()).data.servings, 0);
    const bad = await request('/api/dishes/1/ingredients', json('POST', { ingredientId: 1, amount: 0 }));
    assert.equal((await bad.json()).error.code, 'VALIDATION_FAILED');
    assert.equal(tables.dishIngredient.length, 0);
    assert.equal((await request('/api/dishes/1/ingredients', json('POST', { ingredientId: 1, amount: 10 }))).status, 200);
    assert.equal((await request('/api/dishes/1/ingredients', json('POST', { ingredientId: 2, amount: 200 }))).status, 200);
    const recipe = await (await request('/api/dishes/1/recipe')).json();
    assert.equal(recipe.data.servings, 2);
    assert.equal(recipe.data.recipe[0].amount, 10);
    const changed = await request('/api/dishes/1/ingredients/1', json('PATCH', { amount: 20 }));
    assert.equal((await changed.json()).ok, true);
    assert.equal(tables.dishIngredient.find((row) => row.ingredientId === 1).amount, 20);
    const removed = await request('/api/dishes/1/ingredients/1', { method: 'DELETE' });
    assert.equal((await removed.json()).data, null);
    assert.equal(tables.dishIngredient.length, 1);

    const assigned = await request('/api/chefs/1/dishes', json('POST', { dishId: 1 }));
    assert.equal((await assigned.json()).ok, true);
    const page = await (await request('/api/chefs/1/dishes')).json();
    assert.equal(page.data.assigned.length, 1);
    assert.equal(page.data.assigned[0].dish.name, 'Matcha Latte');
    const duplicate = await request('/api/chefs/1/dishes', json('POST', { dishId: 1 }));
    assert.equal((await duplicate.json()).error.code, 'VALIDATION_FAILED');
    await request('/api/chefs/1/dishes/1', { method: 'DELETE' });
    assert.equal(tables.chefDish.length, 0);
  });
});

test('frontend API origin is assigned only in web/config.js', () => {
  const root = path.join(__dirname, '..');
  const config = fs.readFileSync(path.join(root, 'web/config.js'), 'utf8');
  assert.match(config, /export const API_BASE_URL = 'http:\/\/localhost:3001'/);
  for (const file of ['web/api.js', 'web/main.js', 'web/index.html', 'web/server.js', 'web/escape.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(text.includes('localhost:3001'), false, file);
  }
  assert.match(fs.readFileSync(path.join(root, 'web/api.js'), 'utf8'), /window\.axios/);
});

test('escape helper encodes HTML text', async () => {
  const { esc } = await import('../web/escape.js');
  assert.equal(esc('Matcha <b>Latte</b>'), 'Matcha &lt;b&gt;Latte&lt;/b&gt;');
  assert.equal(esc(`"'&`), '&quot;&#39;&amp;');
});
