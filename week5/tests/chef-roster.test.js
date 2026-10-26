const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers');
const { chefRows } = require('../api/prisma/chef-roster');
const { seedChefs } = require('../scripts/seed-chefs');

test('Chef roster uses Vietnamese name order and imports idempotently without changing existing records', async () => {
  assert.equal(chefRows.length, 28);
  assert.equal(chefRows[0].name, 'Đinh Viết Hải');
  assert.equal(chefRows[11].name, 'Lê Trần Lam Quang');
  assert.equal(chefRows[19].name, 'Nguyễn Hữu Tuấn Anh');
  assert.equal(chefRows[27].name, 'Nguyễn Thế Huy');
  const app = await fixture();
  try {
    const previous = await app.prisma.chef.create({ data: { name: 'Lê Trần Lam Quang', specialty: 'Chuyên môn đã có' } });
    assert.equal((await seedChefs(app.prisma)).pending, 27);
    assert.equal(await app.prisma.chef.count(), 1);
    assert.equal((await seedChefs(app.prisma, { apply: true })).inserted, 27);
    assert.equal((await seedChefs(app.prisma, { apply: true })).inserted, 0);
    assert.equal(await app.prisma.chef.count(), 28);
    assert.deepEqual(await app.prisma.chef.findUnique({ where: { id: previous.id } }), previous);
    const imported = await app.prisma.chef.findMany({ where: { id: { not: previous.id } } });
    assert.ok(imported.every((row) => row.specialty === 'Pha chế'));
    const api = await app.call('/api/chefs?q=' + encodeURIComponent('Nguyễn Thế'));
    assert.equal(api.body.data.length, 2);
  } finally { await app.close(); }
});
