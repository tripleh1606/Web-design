const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers');
let app;
before(async () => { app = await fixture(); });
after(async () => { await app?.close(); });

const examples = {
  dishes: { name: 'Matcha Latte', description: 'Trà xanh', price: 30000, category: 'matcha', available: true },
  chefs: { name: 'Nguyễn Minh An', specialty: 'Pha trà' },
  ingredients: { name: 'Bột matcha', unit: 'g', stock: 500 }
};
for (const [resource, data] of Object.entries(examples)) {
  test(`${resource}: all five REST operations, empty, validation, partial update and missing IDs`, async () => {
    const url = '/api/' + resource;
    let result = await app.call(url);
    assert.deepEqual(result.body, { ok: true, data: [] });
    assert.equal(result.status, 200);
    result = await app.call(url, { method: 'POST', data: { ...data, name: '  ' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.error.code, 'VALIDATION_FAILED');
    assert.ok(result.body.error.fields.name);
    result = await app.call(url, { method: 'POST', data: { ...data, id: 9999, createdAt: 'forbidden', unrelated: true } });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    const created = result.body.data;
    assert.notEqual(created.id, 9999);
    assert.equal(created.unrelated, undefined);
    assert.equal(created.name, data.name);
    result = await app.call(`${url}/${created.id}`);
    assert.deepEqual(result.body.data, created);
    result = await app.call(`${url}/${created.id}`, { method: 'PATCH', data: { name: 'Tên đã sửa' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.name, 'Tên đã sửa');
    for (const key of Object.keys(data).filter((key) => key !== 'name')) assert.deepEqual(result.body.data[key], data[key]);
    result = await app.call(`${url}/${created.id}`, { method: 'PATCH', data: { name: null } });
    assert.equal(result.body.error.code, 'VALIDATION_FAILED');
    result = await app.call(`${url}/${created.id}`, { method: 'PATCH', data: {} });
    assert.equal(result.body.error.code, 'VALIDATION_FAILED');
    for (const id of ['abc', '0', '-1', '2147483648', '999999']) {
      for (const method of ['GET', 'PATCH', 'DELETE']) {
        result = await app.call(`${url}/${id}`, { method, ...(method === 'PATCH' ? { data: { name: 'Valid' } } : {}) });
        assert.equal(result.status, 200);
        assert.equal(result.body.error.code, 'NOT_FOUND');
      }
    }
    result = await app.call(`${url}/${created.id}`, { method: 'DELETE' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true, data: null });
    assert.equal((await app.call(`${url}/${created.id}`)).body.error.code, 'NOT_FOUND');
    assert.deepEqual((await app.call(url)).body.data, []);
  });
}
test('Dish strict JSON types, defaults, Unicode search and zero price', async () => {
  for (const price of [-1, 1.5, '30000', null, true, 2147483648]) {
    const result = await app.call('/api/dishes', { method: 'POST', data: { name: 'Trà', price } });
    assert.equal(result.body.error.code, 'VALIDATION_FAILED');
    assert.ok(result.body.error.fields.price);
  }
  assert.ok((await app.call('/api/dishes', { method: 'POST', data: { name: 'Trà', price: 0, available: 'true' } })).body.error.fields.available);
  const result = await app.call('/api/dishes', { method: 'POST', data: { name: 'Trà ĐÀO', price: 0 } });
  assert.equal(result.body.data.available, true);
  assert.equal(result.body.data.price, 0);
  assert.equal((await app.call('/api/dishes?q=' + encodeURIComponent('đào'))).body.data.length, 1);
  assert.deepEqual((await app.call('/api/dishes?q=no-match')).body.data, []);
  assert.ok((await app.call('/api/dishes', { method: 'POST', data: { name: 'Trà', price: 0, image: 'javascript:alert(1)' } })).body.error.fields.image);
});
test('Technical errors: wrong route/method 404, malformed JSON 400, no ok envelope', async () => {
  for (const [url, options] of [['/api/bok', {}], ['/api/dishes', { method: 'PUT' }], ['/api', {}]]) {
    const result = await app.call(url, options);
    assert.equal(result.status, 404);
    assert.equal(Object.hasOwn(result.body, 'ok'), false);
  }
  const result = await app.call('/api/dishes', { method: 'POST', body: '{bad', headers: { 'Content-Type': 'application/json' } });
  assert.equal(result.status, 400);
  assert.equal(Object.hasOwn(result.body, 'ok'), false);
  const noJson = await app.call('/api/dishes', { method: 'POST', body: 'name=abc', headers: { 'Content-Type': 'text/plain' } });
  assert.equal(noJson.body.error.code, 'VALIDATION_FAILED');
});
test('CORS exact configured origin, OPTIONS for PATCH/DELETE/JSON, denied foreign origin', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const result = await app.call('/api/dishes/1', { method: 'OPTIONS', headers: {
      Origin: 'http://localhost:5173', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'content-type'
    } });
    assert.equal(result.status, 204);
    assert.equal(result.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.ok(result.headers.get('access-control-allow-methods').includes(method));
    assert.equal(result.headers.get('access-control-allow-headers'), 'Content-Type');
  }
  const allowed = await app.call('/api/dishes', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const denied = await app.call('/api/dishes', { method: 'POST', data: examples.dishes, headers: { Origin: 'https://foreign.example' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});
test('Invalid IDs are handled before DB; real database failure stays HTTP 500 without secrets', async () => {
  await app.prisma.$executeRawUnsafe('DROP TABLE dishes');
  assert.equal((await app.call('/api/dishes/abc')).body.error.code, 'NOT_FOUND');
  const result = await app.call('/api/dishes');
  assert.equal(result.status, 500);
  assert.equal(Object.hasOwn(result.body, 'ok'), false);
  assert.equal(JSON.stringify(result.body).includes(app.folder), false);
  assert.equal(JSON.stringify(app.logs).includes(app.folder), false);
  assert.ok(app.logs.length);
});
