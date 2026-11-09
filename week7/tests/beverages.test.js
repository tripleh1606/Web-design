const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers');
const { checkedRows, seedBeverages } = require('../scripts/seed-beverages');
const { DATASET_TAG, summary } = require('../api/prisma/demo-beverages');

test('Week 5: 1200 synthetic beverages preserve existing data, support search/filter, and do not duplicate on rerun', async () => {
  const rows = checkedRows();
  assert.deepEqual(summary(rows).categories, { coffee: 400, matcha: 400, houjicha: 400 });
  const app = await fixture();
  try {
    const original = await app.prisma.dish.create({ data: { name: 'Món cũ cần giữ', price: 30000 } });
    assert.equal((await seedBeverages(app.prisma)).pending, 1200);
    assert.equal(await app.prisma.dish.count(), 1, 'dry-run must not write');
    const first = await seedBeverages(app.prisma, { apply: true });
    assert.equal(first.inserted, 1200);
    assert.equal(first.databaseAfter, 1201);
    const second = await seedBeverages(app.prisma, { apply: true });
    assert.equal(second.inserted, 0);
    assert.equal(await app.prisma.dish.count(), 1201);
    assert.deepEqual(await app.prisma.dish.findUnique({ where: { id: original.id } }), original);
    for (const category of ['coffee', 'matcha', 'houjicha']) {
      const result = await app.call(`/api/dishes?category=${category}&sort=price-asc`);
      assert.equal(result.body.data.length, 400);
      assert.ok(result.body.data.every((row) => row.description.startsWith(DATASET_TAG)));
      assert.ok(result.body.data.every((row, index, all) => !index || all[index - 1].price <= row.price));
    }
    const search = await app.call('/api/dishes?q=' + encodeURIComponent('Cà phê sữa'));
    assert.equal(search.body.data.length, 80);
    assert.equal((await app.call('/api/dishes?q=houjicha')).body.data.length, 400);
    // A conflicting real record aborts the whole import instead of being overwritten.
    await app.prisma.dish.deleteMany({ where: { description: { startsWith: DATASET_TAG } } });
    const collision = await app.prisma.dish.create({ data: { name: rows[0].name, price: 1 } });
    await assert.rejects(seedBeverages(app.prisma, { apply: true }), /NAME_COLLISION_WITH_EXISTING_DATA/);
    assert.equal(await app.prisma.dish.count(), 2);
    assert.equal((await app.prisma.dish.findUnique({ where: { id: collision.id } })).price, 1);
  } finally {
    await app.close();
  }
});
