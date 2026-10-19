const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { databaseProvider, schemaPath, createPrisma } = require('../api/src/database');
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('PostgreSQL schema matches week 3; independent clients select provider without rewriting env', async () => {
  const normalize = (text) => text.replace(/output\s*=\s*"[^"]*"/, 'output = "GENERATED"').replaceAll('\r\n', '\n').trim();
  assert.equal(normalize(read('../api/prisma/schema.prisma')), normalize(read('../../week3/restaurant/prisma/schema.prisma')));
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
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
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
