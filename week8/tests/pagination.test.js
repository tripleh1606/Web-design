const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./helpers');
const { parsePageQuery, pageQuery, dishPage } = require('../api/src/pagination');
let app;
const rows = Array.from({ length: 23 }, (_, index) => ({
  id: (index + 1) * 2,
  name: index === 21 ? '100% SQL_notes!' : index === 22 ? '1000X SQLXnotes' : `Menu ${String(index + 1).padStart(2, '0')}`,
  category: ['coffee', 'matcha', 'houjicha'][index % 3],
  price: index % 5 === 0 ? 0 : (index % 3 + 1) * 10000,
  available: index % 2 === 0
}));

before(async () => {
  app = await fixture();
  await app.prisma.dish.createMany({ data: rows });
});
after(async () => { await app?.close(); });
const page = (query = '') => app.call('/api/dishes/paged' + (query ? '?' + query : ''));

test('pagination: defaults, middle/last/out-of-range pages, ID gaps and old list compatibility', async () => {
  let result = await page();
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.error, null);
  assert.equal(result.body.data.total, 23);
  assert.equal(result.body.data.page, 1);
  assert.equal(result.body.data.pageSize, 10);
  assert.deepEqual(result.body.data.items.map((row) => row.id), rows.slice(0, 10).map((row) => row.id));
  assert.equal(typeof result.body.data.items[0].available, 'boolean');
  result = await page('page=2');
  assert.deepEqual(result.body.data.items.map((row) => row.id), rows.slice(10, 20).map((row) => row.id));
  assert.equal(result.body.data.total, 23);
  result = await page('page=3');
  assert.equal(result.body.data.items.length, 3);
  result = await page('page=4');
  assert.deepEqual(result.body.data, { items: [], total: 23, page: 4, pageSize: 10 });
  result = await page('q=no-matching-menu');
  assert.equal(result.body.ok, true);
  assert.deepEqual(result.body.data, { items: [], total: 0, page: 1, pageSize: 10 });
  assert.equal((await app.call('/api/dishes')).body.data.length, 23);
  assert.equal((await app.call('/api/dishes/2')).body.data.id, 2);
});

test('pagination: the shared contract can load every item without omissions or duplicates', async () => {
  const collected = [];
  let nextPage = 1;
  while (true) {
    const { body } = await page(`page=${nextPage}&pageSize=5`);
    const { items, total, page: currentPage, pageSize } = body.data;
    collected.push(...items.map((row) => row.id));
    if (!items.length || currentPage * pageSize >= total) break;
    nextPage++;
    assert.ok(nextPage <= 6, 'must stop when metadata reports the end');
  }
  assert.deepEqual(collected, rows.map((row) => row.id));
  assert.equal(new Set(collected).size, 23);
  const { body } = await page('pageSize=23');
  assert.equal(body.data.items.length, body.data.pageSize);
  assert.ok(body.data.page * body.data.pageSize >= body.data.total, 'a full final page still ends');
});

test('pagination: query validation rejects invalid values, repeats and unknown parameters', async () => {
  const invalid = [
    ['page=0', 'page'], ['page=-1', 'page'], ['page=1.5', 'page'], ['page=abc', 'page'],
    ['page=', 'page'], ['page=1e2', 'page'], ['page=9007199254740993', 'page'],
    ['page=2147483647&pageSize=100', 'page'], ['page=1&page=2', 'page'],
    ['pageSize=0', 'pageSize'], ['pageSize=101', 'pageSize'], ['pageSize=2.5', 'pageSize'],
    ['pageSize[x]=10', 'pageSize'], ['available=0', 'available'], ['available=False', 'available'],
    ['minPrice=-1', 'minPrice'], ['maxPrice=abc', 'maxPrice'], ['minPrice=2&maxPrice=1', 'maxPrice'],
    ['sort=price', 'sort'], ['category=unknown', 'category'], ['q[a]=b', 'q'],
    ['q=' + 'x'.repeat(121), 'q'], ['mode=fuzzy', 'mode']
  ];
  for (const [query, field] of invalid) {
    const result = await page(query);
    assert.equal(result.status, 200, query);
    assert.equal(result.body.ok, false, query);
    assert.equal(result.body.data, null, query);
    assert.equal(result.body.error.code, 'VALIDATION_FAILED', query);
    assert.ok(result.body.error.fields[field], query);
  }
});

test('pagination: literal search, AND filters, zero/false and stable sorting apply before LIMIT/OFFSET', async () => {
  for (const q of ['100%', 'SQL_', '!']) {
    const { body } = await page(new URLSearchParams({ q }).toString());
    assert.equal(body.data.total, 1, q);
    assert.equal(body.data.items[0].id, 44, q);
  }
  const injected = await page(new URLSearchParams({ q: "%' OR 1=1 --" }).toString());
  assert.equal(injected.body.data.total, 0);
  const expected = rows.filter((row) => row.category === 'coffee' && !row.available && row.price === 0);
  const filtered = await page('category=coffee&available=false&minPrice=0&maxPrice=0&pageSize=1');
  assert.equal(filtered.body.data.total, expected.length);
  assert.deepEqual(filtered.body.data.items.map((row) => row.id), expected.slice(0, 1).map((row) => row.id));
  assert.ok(expected.some((row) => row.id > 20), 'fixture must expose filtering only page one');
  for (const sort of ['price-asc', 'price-desc']) {
    const expectedSorted = [...rows].sort((a, b) => (sort === 'price-asc' ? a.price - b.price : b.price - a.price) || a.id - b.id);
    const { body } = await page(`sort=${sort}&page=2&pageSize=4`);
    assert.deepEqual(body.data.items.map((row) => row.id), expectedSorted.slice(4, 8).map((row) => row.id));
  }
  for (const sort of ['name-asc', 'name-desc', 'id-desc']) {
    const { body } = await page(`sort=${sort}`);
    assert.equal(body.ok, true, sort);
    assert.equal(body.data.items.length, 10, sort);
  }
  const emptyFilters = await page('q=%20&category=%20&minPrice=%20&maxPrice=%20&available=%20');
  assert.equal(emptyFilters.body.data.total, 23);
});

test('pagination: PostgreSQL executes the actual parameterized queries and matches Vietnamese case', async () => {
  const db = require('./postgres').postgres();
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, '../api/sql/001-schema.sql'), 'utf8'));
    await db.query('INSERT INTO dishes (name,price,category,available) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)',
      ['CÀ PHÊ 100%_!', 0, 'coffee', false, 'Cà phê 1000X', 30000, 'coffee', true]);
    const adapter = { $queryRaw: async (query) => (await db.query(query.text, query.values)).rows };
    const options = parsePageQuery({ q: 'cà phê', available: 'false', minPrice: '0', maxPrice: '0' }).value;
    const result = await dishPage(adapter, options);
    assert.equal(result.total, 1);
    assert.equal(result.items[0].name, 'CÀ PHÊ 100%_!');
    assert.equal(result.items[0].available, false);
    for (const q of ['100%', '_!', "%' OR true --"]) {
      const data = await dishPage(adapter, parsePageQuery({ q }).value);
      assert.equal(data.total, q.includes('OR') ? 0 : 1, q);
    }
    const query = pageQuery(options);
    assert.match(query.text, /LIMIT \$\d+ OFFSET \$\d+/);
    assert.ok(!query.text.includes('cà phê'));
    assert.ok(query.values.includes('%cà phê%'));
    const outOfRange = await dishPage(adapter, parsePageQuery({ page: '2' }).value);
    assert.deepEqual(outOfRange, { items: [], total: 2, page: 2, pageSize: 10 });
  } finally { await db.close(); }
});

test('pagination: technical DB errors stay 500, validation runs before any query', async () => {
  const isolated = await fixture();
  try {
    await isolated.prisma.$executeRawUnsafe('DROP TABLE dishes');
    const invalid = await isolated.call('/api/dishes/paged?page=0');
    assert.equal(invalid.body.error.code, 'VALIDATION_FAILED');
    const failure = await isolated.call('/api/dishes/paged');
    assert.equal(failure.status, 500);
    assert.equal(Object.hasOwn(failure.body, 'ok'), false);
    assert.ok(!JSON.stringify(failure.body).includes(isolated.folder));
  } finally { await isolated.close(); }
});
