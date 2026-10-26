const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
const { createPrisma, databaseProvider } = require('../api/src/database');
const { createApp } = require('../api/src/app');

async function main() {
  const prisma = createPrisma();
  let server;
  try {
    const expected = await prisma.dish.findMany({
      select: { id: true, name: true, price: true, category: true, available: true }, orderBy: { id: 'asc' }
    });
    server = createApp({ prisma, spaOrigin: 'http://localhost:5173', logger: { error() {} } }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/dishes/paged`;
    async function get(query = {}) {
      const response = await fetch(base + '?' + new URLSearchParams(query));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.error, null);
      return body.data;
    }
    const first = await get();
    assert.equal(first.page, 1);
    assert.equal(first.pageSize, 10);
    assert.equal(first.total, expected.length);
    assert.deepEqual(first.items.map((row) => row.id), expected.slice(0, 10).map((row) => row.id));
    const ids = [];
    let pagesVisited = 0;
    let lastPageCount = 0;
    for (let page = 1; ; page++) {
      const data = await get({ page, pageSize: 100 });
      assert.equal(data.total, expected.length, 'keep dataset stable during live verification');
      ids.push(...data.items.map((row) => row.id));
      pagesVisited++;
      lastPageCount = data.items.length;
      if (!data.items.length || data.page * data.pageSize >= data.total) break;
    }
    assert.deepEqual(ids, expected.map((row) => row.id));
    assert.equal(new Set(ids).size, expected.length);
    const beyond = await get({ page: Math.ceil(expected.length / 100) + 1, pageSize: 100 });
    assert.equal(beyond.total, expected.length);
    assert.deepEqual(beyond.items, []);
    for (const q of ['Matcha', 'CÀ PHÊ', '0%', "%' OR true --"]) {
      const data = await get({ q });
      const matches = expected.filter((row) => row.name.toLocaleLowerCase('vi').includes(q.toLocaleLowerCase('vi')));
      assert.equal(data.total, matches.length, q);
      assert.deepEqual(data.items.map((row) => row.id), matches.slice(0, 10).map((row) => row.id), q);
    }
    const filtered = await get({ category: 'coffee', available: 'false', minPrice: 0, maxPrice: 40000, sort: 'price-asc', pageSize: 7, page: 2 });
    const matches = expected.filter((row) => row.category === 'coffee' && !row.available && row.price >= 0 && row.price <= 40000)
      .sort((a, b) => a.price - b.price || a.id - b.id);
    assert.equal(filtered.total, matches.length);
    assert.deepEqual(filtered.items.map((row) => row.id), matches.slice(7, 14).map((row) => row.id));
    const invalid = await (await fetch(base + '?page=0')).json();
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, 'VALIDATION_FAILED');
    console.log(JSON.stringify({ connected: true, provider: databaseProvider(process.env.DATABASE_URL),
      total: expected.length, pagesVisited, pageSize: 100, lastPageCount,
      uniqueIds: new Set(ids).size, searchAndFilterChecks: 'passed', readOnly: true }, null, 2));
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error('Live pagination verification failed:', error.code || error.name);
  process.exitCode = 1;
});
