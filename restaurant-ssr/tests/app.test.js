const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createApp } = require('../src/app');

function fakePrisma() {
  const tables = { dish: [], chef: [], ingredient: [] };
  const client = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
    async findMany({ where = {}, orderBy = {} } = {}) {
      const query = where.name?.contains?.toLocaleLowerCase('vi');
      const filtered = rows.filter((row) => (!query || row.name.toLocaleLowerCase('vi').includes(query)) && (!where.category || row.category === where.category));
      return [...filtered].sort((a, b) => orderBy.price ? (orderBy.price === 'desc' ? b.price - a.price : a.price - b.price) : orderBy.id === 'desc' ? b.id - a.id : a.id - b.id);
    },
    async findUnique({ where }) { return rows.find((row) => row.id === where.id) || null; },
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
  }]));
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
      ['ingredients', 'ingredient', { name: 'Rau', unit: 'kg' }, { name: 'Rau mới', unit: 'bó' }]
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
