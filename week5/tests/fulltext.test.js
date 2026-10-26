const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { parsePageQuery, pageQuery } = require('../api/src/pagination');
const { createApp } = require('../api/src/app');
const { fixture } = require('./helpers');
const { postgres } = require('./postgres');

test('fulltext validates mode, required q and relevance ordering before querying', () => {
  for (const query of [{ mode: 'fulltext' }, { mode: 'fulltext', q: '   ' }, { mode: 'fulltext', q: ['matcha'] }]) {
    assert.ok(parsePageQuery(query).fields.q);
  }
  assert.ok(parsePageQuery({ mode: 'unknown' }).fields.mode);
  assert.ok(parsePageQuery({ mode: 'fulltext', q: 'matcha', sort: 'price-asc' }).fields.sort);
  assert.ok(parsePageQuery({ sort: 'relevance' }).fields.sort);
  const result = parsePageQuery({ mode: 'fulltext', q: 'matcha vani' });
  assert.deepEqual(result.fields, {});
  assert.equal(result.value.sort, 'relevance');
  const query = pageQuery(result.value);
  assert.match(query.text, /"fts" @@ plainto_tsquery\('simple', \$\d+\)/);
  assert.match(query.text, /ts_rank/);
  assert.doesNotMatch(query.text, /LIKE/);
  assert.ok(query.values.includes('matcha vani'));
});

test('SQLite explicitly reports PostgreSQL required instead of pretending LIKE is fulltext', async () => {
  const app = await fixture();
  try {
    const result = await app.call('/api/dishes/paged?mode=fulltext&q=matcha');
    assert.equal(result.status, 200);
    assert.equal(result.body.error.code, 'FULLTEXT_REQUIRES_POSTGRESQL');
    assert.equal((await app.call('/api/dishes/paged?mode=fulltext&q=')).body.error.code, 'VALIDATION_FAILED');
    assert.equal((await app.call('/api/dishes/paged?mode=smart&q=houjcha')).body.error.code, 'FULLTEXT_REQUIRES_POSTGRESQL');
    assert.equal((await app.call('/api/dishes/paged?mode=smart')).body.ok, true);
  } finally { await app.close(); }
});

test('smart search tolerates missing middle words, per-word typos and transpositions without ignoring other terms or filters', async () => {
  const db = postgres();
  let server;
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, '../api/sql/001-schema.sql'), 'utf8'));
    const rows = [
      [11, 'Houjicha Cold Whisk', null, 45000, 'houjicha', true],
      [12, 'Houjicha Roasted Whisk', null, 0, 'houjicha', false],
      [13, 'Houjicha Latte', null, 35000, 'houjicha', true],
      [14, 'Latte dịu', 'Matcha có hương thơm của vani.', 30000, 'matcha', true]
    ];
    for (const row of rows) await db.query('INSERT INTO dishes (id,name,description,price,category,available) VALUES ($1,$2,$3,$4,$5,$6)', row);
    const prisma = { $queryRaw: async (query) => (await db.query(query.text, query.values)).rows };
    server = createApp({ prisma, spaOrigin: 'http://localhost:5173', logger: { error() {} } }).listen(0);
    await once(server, 'listening');
    async function get(query = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/dishes/paged?${new URLSearchParams({ mode: 'smart', ...query })}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true, JSON.stringify(body.error));
      return body.data;
    }
    assert.deepEqual(parsePageQuery({ mode: 'smart', q: 'houjcha whsk' }).fields, {});
    assert.equal(parsePageQuery({ mode: 'smart', q: 'houjcha whsk' }).value.sort, 'relevance');
    assert.ok(parsePageQuery({ mode: 'smart', sort: 'relevance' }).fields.sort);
    assert.equal((await get()).total, rows.length);
    for (const q of ['houjicha whisk', 'whisk houjicha', 'houjcha whsk', 'houjcha whsik', 'hojicha wisk']) {
      const result = await get({ q });
      assert.deepEqual(result.items.map((row) => row.id), [11, 12], q);
      assert.equal(result.items[0].matchType, q.includes('houjicha') ? 'fulltext' : 'fuzzy', q);
      assert.ok(Number.isFinite(result.items[0].rank));
      assert.equal(Object.hasOwn(result.items[0], '__rank'), false);
    }
    assert.equal((await get({ q: 'vani matcha' })).items[0].id, 14, 'fulltext still searches description');
    assert.deepEqual((await get({ q: 'houjicha coldd whisk' })).items.map((row) => row.id), [11]);
    for (const q of ['houjicha zzzzz', 'zzzzzz', 'ho', '!!!', "vani' OR 1=1 --"]) assert.equal((await get({ q })).total, 0, q);
    assert.deepEqual((await get({ q: 'houjcha whsk', available: false, minPrice: 0, maxPrice: 0 })).items.map((row) => row.id), [12]);
    assert.equal((await get({ q: 'houjcha whsk', category: 'coffee' })).total, 0);
    assert.equal((await get({ q: 'houjcha whsk', sort: 'price-asc' })).items[0].id, 12);
    const first = await get({ q: 'houjcha whsk', pageSize: 1 });
    const second = await get({ q: 'houjcha whsk', pageSize: 1, page: 2 });
    assert.equal(first.total, 2);
    assert.deepEqual([...first.items, ...second.items].map((row) => row.id), [11, 12]);
    assert.deepEqual(await get({ q: 'houjcha whsk', pageSize: 1, page: 3 }), { items: [], total: 2, page: 3, pageSize: 1 });
    await db.query('INSERT INTO dishes (id,name,price) VALUES (21,$1,40000)', ['Houjcha Whsk']);
    const ranked = await get({ q: 'houjcha whsk' });
    assert.deepEqual(ranked.items.map((row) => row.id), [21, 11, 12]);
    assert.ok(ranked.items[0].rank > ranked.items[1].rank, 'exact word matches rank above fuzzy matches');
    await db.query('UPDATE dishes SET name=$1 WHERE id=13', ['Houjicha Daily Whisk']);
    assert.equal((await get({ q: 'houjicha whisk' })).items.find((row) => row.id === 13).matchType, 'fulltext');
    for (const q of ['houcha', 'houcha whisk']) {
      const result = await get({ q });
      assert.ok(result.items.some((row) => row.id === 11), q);
      assert.ok(result.items.every((row) => row.matchType !== 'suggestion'), q);
    }
    for (const q of ['kswh', 'houcha kswh']) {
      const all = await get({ q, pageSize: 100 });
      assert.ok(all.items.some((row) => row.id === 11), q);
      const result = await get({ q, pageSize: 1 });
      assert.ok(result.total >= 3, q);
      assert.equal(result.items[0].id, all.items[0].id, q);
      assert.equal(result.items[0].matchType, 'suggestion', q);
      const next = await get({ q, pageSize: 1, page: 2 });
      assert.equal(next.total, result.total);
      assert.notEqual(next.items[0].id, result.items[0].id);
    }
    for (const q of ['kswh zzzzz', 'kkww', 'bi']) assert.equal((await get({ q })).total, 0, q);
    await db.query('INSERT INTO dishes (id,name,price) VALUES (31,$1,15000),(32,$2,40000)', ['Bánh bò', 'Cơm bò']);
    for (const q of ['báh bì', 'bah bi', 'banh bo', 'BÁNH BÒ', 'bánh bò'.normalize('NFD')]) {
      assert.deepEqual((await get({ q })).items.map((row) => row.id), [31], q);
    }
    assert.deepEqual((await get({ q: 'com bo' })).items.map((row) => row.id), [32]);
    // Weak rearrangements must not compete with ordinary or exact matches.
    await db.query('INSERT INTO dishes (id,name,price,available) VALUES (45,$1,10000,true)', ['Kswh']);
    assert.deepEqual((await get({ q: 'kswh' })).items.map((row) => row.id), [45]);
    const filteredSuggestion = await get({ q: 'kswh', available: false });
    assert.deepEqual(filteredSuggestion.items.map((row) => row.id), [12]);
    assert.equal(filteredSuggestion.items[0].matchType, 'suggestion');
    // A misleading strong match (chai/chất) must not suppress the entire Matcha family.
    const matchaIds = [];
    for (let index = 0; index < 13; index++) {
      const id = 100 + index;
      matchaIds.push(id);
      await db.query('INSERT INTO dishes (id,name,price,category,available) VALUES ($1,$2,$3,$4,$5)',
        [id, `Matcha Latte ${index}`, index * 1000, 'matcha', index % 2 === 0]);
    }
    await db.query('INSERT INTO dishes (id,name,price,category) VALUES (120,$1,30000,$2)', ['Matcha 100% nguyên chất', 'matcha']);
    matchaIds.push(120);
    await db.query('INSERT INTO dishes (id,name,price,category) VALUES (121,$1,30000,$2)', ['Cà phê đóng chai', 'coffee']);
    await db.query('INSERT INTO dishes (id,name,description,price,category) VALUES (122,$1,$2,30000,$3)', ['Latte', 'Pha cùng Matcha.', 'coffee']);
    for (const q of ['chatma', 'tacmah']) {
      const ids = [];
      const baseline = await get({ q: 'matcha', pageSize: 100 });
      for (let page = 1; ; page++) {
        const result = await get({ q, page, pageSize: 5 });
        assert.equal(result.correctedQuery, 'matcha');
        assert.equal(result.total, baseline.total);
        ids.push(...result.items.map((row) => row.id));
        assert.ok(result.items.every((row) => !Object.hasOwn(row, '__correctedQuery')));
        if (page * 5 >= result.total) break;
      }
      assert.equal(new Set(ids).size, baseline.total, q);
      assert.deepEqual(ids, baseline.items.map((row) => row.id), q);
      for (const id of matchaIds) assert.ok(ids.includes(id), `${q}: missing Matcha ${id}`);
      assert.ok(ids.includes(122), 'corrected fulltext includes description-only matches');
      assert.equal(ids.includes(121), false, 'chai is not a correction for chatma');
    }
    const filteredCorrection = await get({ q: 'chatma', category: 'matcha', available: false, minPrice: 0, maxPrice: 4000 });
    assert.deepEqual(filteredCorrection.items.map((row) => row.id), [101, 103]);
    const descriptionCorrection = await get({ q: 'chatma', category: 'coffee' });
    assert.equal(descriptionCorrection.correctedQuery, 'matcha', 'filters must not change how the word is interpreted');
    assert.deepEqual(descriptionCorrection.items.map((row) => row.id), [122]);
    const beyondCorrection = await get({ q: 'chatma', page: 100 });
    assert.equal(beyondCorrection.correctedQuery, 'matcha');
    assert.deepEqual(beyondCorrection.items, []);
    assert.equal((await get({ q: 'chatma zzzzz' })).total, 0);
    await db.query('INSERT INTO dishes (id,name,price) VALUES (123,$1,20000)', ['Chatma']);
    const literal = await get({ q: 'chatma', pageSize: 100 });
    assert.equal(literal.correctedQuery, undefined, 'never replace an actual dictionary word');
    assert.equal(literal.items[0].id, 123);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await db.close();
  }
});

test('PostgreSQL fulltext searches name+description, ranks stably, paginates and preserves AND filters', async () => {
  const db = postgres();
  let server;
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, '../api/sql/001-schema.sql'), 'utf8'));
    const rows = [
      [2, 'Matcha Vani', null, 0, 'matcha', false],
      [5, 'Latte dịu', 'Matcha có hương thơm của vani.', 42000, 'matcha', true],
      [9, 'Matcha Vani', null, 35000, 'matcha', true],
      [14, 'Cafe', 'Cà phê roasted thơm.', 28000, 'coffee', true],
      [20, 'Houjicha', 'Trà rang vani.', 30000, 'houjicha', true]
    ];
    for (const row of rows) await db.query('INSERT INTO dishes (id,name,description,price,category,available) VALUES ($1,$2,$3,$4,$5,$6)', row);
    // Only the transport is adapted: all search/pagination SQL executes in real PostgreSQL.
    const prisma = { $queryRaw: async (query) => (await db.query(query.text, query.values)).rows };
    server = createApp({ prisma, spaOrigin: 'http://localhost:5173', logger: { error() {} } }).listen(0);
    await once(server, 'listening');
    async function get(query) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/dishes/paged?${new URLSearchParams(query)}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      return body.data;
    }
    const first = await get({ mode: 'fulltext', q: 'vani matcha', pageSize: 2 });
    assert.equal(first.total, 3);
    assert.deepEqual(first.items.map((row) => row.id), [2, 9]);
    assert.equal(first.items[0].rank, first.items[1].rank);
    const second = await get({ mode: 'fulltext', q: 'vani matcha', pageSize: 2, page: 2 });
    assert.deepEqual(second.items.map((row) => row.id), [5]);
    assert.ok(first.items[0].rank > second.items[0].rank, 'name weight A outranks description weight B');
    const emptyPage = await get({ mode: 'fulltext', q: 'vani matcha', pageSize: 2, page: 3 });
    assert.deepEqual(emptyPage, { items: [], total: 3, page: 3, pageSize: 2 });
    assert.equal((await get({ mode: 'basic', q: 'vani matcha' })).total, 0);
    assert.equal((await get({ mode: 'fulltext', q: 'roasted' })).items[0].id, 14);
    assert.equal((await get({ mode: 'basic', q: 'roasted' })).total, 0);
    assert.equal((await get({ mode: 'fulltext', q: 'mat' })).total, 0);
    assert.equal((await get({ mode: 'basic', q: 'mat' })).total, 2);
    const zeroFalse = await get({ mode: 'fulltext', q: 'matcha', minPrice: 0, maxPrice: 0, available: false, category: 'matcha' });
    assert.deepEqual(zeroFalse.items.map((row) => row.id), [2]);
    assert.equal((await get({ mode: 'fulltext', q: 'matcha', category: 'coffee' })).total, 0);
    assert.equal((await get({ mode: 'fulltext', q: "vani' OR 1=1 --" })).total, 0);
    await db.query('UPDATE dishes SET description=$1 WHERE id=$2', ['Matcha vani mới.', 14]);
    assert.equal((await get({ mode: 'fulltext', q: 'matcha vani' })).total, 4);
    assert.equal((await get({ mode: 'fulltext', q: '!!!' })).total, 0);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await db.close();
  }
});
