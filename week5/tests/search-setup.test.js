const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { postgres } = require('./postgres');
const { runSearchSetup, sqlFile } = require('../scripts/setup-search');

test('search setup passes the complete SQL file to Prisma instead of discarding commented statements', () => {
  let call;
  runSearchSetup({ run: (...args) => { call = args; return { status: 0 }; } });
  assert.equal(call[1][call[1].indexOf('--file') + 1], sqlFile);
  assert.ok(fs.readFileSync(sqlFile, 'utf8').includes('$fts_function$'));
  assert.ok(call[1].includes('execute'));
  assert.throws(() => runSearchSetup({ run: () => ({ status: 1 }) }), /SEARCH_SETUP_FAILED/);
});

test('search setup handles empty DB, plain/generated fts, NULL descriptions and repeated runs without losing records', async () => {
  const db = postgres();
  const sql = fs.readFileSync(sqlFile, 'utf8');
  try {
    await db.exec(sql); // pre-push on a brand new DB
    await db.exec(fs.readFileSync(path.join(__dirname, '../api/sql/001-schema.sql'), 'utf8'));
    await db.query('INSERT INTO dishes (name,description,price) VALUES ($1,$2,$3)', ['Coffee Original', null, 32000]);
    const before = (await db.query('SELECT id,name,description,price FROM dishes')).rows;
    assert.equal((await db.query("SELECT fts @@ plainto_tsquery('simple','coffee') AS matches FROM dishes")).rows[0].matches, true);
    // Reproduce the teammate's generated-column installation in this test DB.
    await db.exec("DROP TRIGGER dishes_fts_refresh ON dishes; ALTER TABLE dishes DROP COLUMN fts; ALTER TABLE dishes ADD COLUMN fts tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple',coalesce(name,'')),'A') || setweight(to_tsvector('simple',coalesce(description,'')),'B')) STORED;");
    await db.exec(sql);
    assert.deepEqual((await db.query('SELECT id,name,description,price FROM dishes')).rows, before);
    assert.equal((await db.query("SELECT is_generated FROM information_schema.columns WHERE table_name='dishes' AND column_name='fts'")).rows[0].is_generated, 'NEVER');
    await db.query('UPDATE dishes SET name=$1, description=$2', ['Matcha Updated', 'Fresh vanilla']);
    assert.equal((await db.query("SELECT fts @@ plainto_tsquery('simple','updated vanilla') AS matches FROM dishes")).rows[0].matches, true);
    await db.query('INSERT INTO dishes (name,price) VALUES ($1,$2)', ['Houjicha New', 0]);
    assert.equal((await db.query('SELECT count(*)::int AS total FROM dishes WHERE fts IS NULL')).rows[0].total, 0);
    const stable = (await db.query('SELECT id,name,price,fts::text FROM dishes ORDER BY id')).rows;
    await db.exec(sql);
    assert.deepEqual((await db.query('SELECT id,name,price,fts::text FROM dishes ORDER BY id')).rows, stable);
    const indexes = (await db.query("SELECT indexname FROM pg_indexes WHERE tablename='dishes'")).rows.map((row) => row.indexname);
    for (const index of ['dishes_fts_idx', 'dishes_name_trgm_idx', 'dishes_adv_filter_idx']) assert.ok(indexes.includes(index));
  } finally { await db.close(); }
});
