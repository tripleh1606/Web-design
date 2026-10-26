const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { databaseProvider, schemaPath, createPrisma } = require('../api/src/database');
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('Week 5 preserves week-3 business models and explicitly adds its search column/indexes', async () => {
  const normalize = (text) => text.replace(/output\s*=\s*"[^"]*"/, 'output = "GENERATED"')
    .replaceAll('\r\n', '\n').split('\n').filter((line) => !/^\s*\/\//.test(line) && !/^\s*fts\s+Unsupported\("tsvector"\)\?\s*$/.test(line) &&
      !/^\s*@@index.*map: "dishes_(?:fts|name_trgm|adv_filter)_idx"\)\s*$/.test(line)).join('\n').trim();
  assert.equal(normalize(read('../api/prisma/schema.prisma')), normalize(read('../../week3/restaurant/prisma/schema.prisma')));
  const schema = read('../api/prisma/schema.prisma');
  assert.match(schema, /fts\s+Unsupported\("tsvector"\)\?/);
  for (const index of ['dishes_fts_idx', 'dishes_name_trgm_idx', 'dishes_adv_filter_idx']) assert.ok(schema.includes(index));
  assert.equal(read('../api/prisma/search-setup.sql'), read('../restaurant/prisma/search-setup.sql'));
  assert.equal(databaseProvider('postgresql://example:placeholder@localhost/database'), 'postgresql');
  assert.equal(databaseProvider('postgres://example:placeholder@localhost/database'), 'postgresql');
  assert.equal(databaseProvider('file:./soucha.db'), 'sqlite');
  assert.ok(schemaPath('file:./soucha.db').endsWith('schema.sqlite.prisma'));
  assert.throws(() => databaseProvider('invalid'), /DATABASE_URL/);
  const pg = createPrisma({ url: 'postgresql://example:placeholder@localhost/database' });
  const sqlite = createPrisma({ url: 'file:./soucha.db' });
  await Promise.all([pg.$disconnect(), sqlite.$disconnect()]);
});

test('SQL executes in PostgreSQL and preserves UTF-8, existing stock, relations and cascade', async () => {
  const db = require('./postgres').postgres();
  try {
    await db.exec(read('../api/sql/001-schema.sql'));
    await db.exec(read('../api/sql/002-seed.sql'));
    for (const [table, expected] of [['dishes', 8], ['chefs', 2], ['ingredients', 3], ['dish_ingredients', 6], ['chef_dishes', 4]]) {
      assert.equal((await db.query(`SELECT count(*)::int AS total FROM ${table}`)).rows[0].total, expected, table);
    }
    assert.equal((await db.query('SELECT name FROM ingredients WHERE name=$1', ['Sữa tươi'])).rows[0].name, 'Sữa tươi');
    await db.query('UPDATE ingredients SET stock=$1 WHERE name=$2', [123, 'Sữa tươi']);
    await db.exec(read('../api/sql/002-seed.sql'));
    assert.equal((await db.query('SELECT stock FROM ingredients WHERE name=$1', ['Sữa tươi'])).rows[0].stock, 123);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM dishes')).rows[0].total, 8);
    assert.equal((await db.query('SELECT r.amount FROM dish_ingredients r JOIN dishes d ON d.id=r."dishId" WHERE d.name=$1', ['Matcha Latte'])).rows.length, 2);
    await db.query('DELETE FROM dishes WHERE name=$1', ['Matcha Latte']);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM dish_ingredients r LEFT JOIN dishes d ON d.id=r."dishId" WHERE d.id IS NULL')).rows[0].total, 0);
  } finally { await db.close(); }
});
