const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { fixture } = require('./helpers');
const { createAccessTokens } = require('../api/src/auth/access-token');

let app, users, tokens, dishes, chefs, ingredients, issuer;
const roles = ['admin', 'manager', 'chef', 'staff', 'customer'];

before(async () => {
  const secret = randomBytes(32).toString('base64url');
  app = await fixture({ auth: { jwtSecret: secret } });
  issuer = createAccessTokens(secret);
  chefs = await Promise.all(['Assigned chef', 'Other chef'].map((name) =>
    app.prisma.chef.create({ data: { name, specialty: 'Tea' } })));
  ingredients = await Promise.all(['Assigned ingredient', 'Other ingredient'].map((name) =>
    app.prisma.ingredient.create({ data: { name, unit: 'g', stock: 100 } })));
  dishes = await Promise.all([true, false].map((available, i) =>
    app.prisma.dish.create({ data: {
      name: `Dish ${i}`, price: 100, available,
      ingredients: { create: { ingredientId: ingredients[i].id, amount: 2 } },
      chefs: { create: { chefId: chefs[i].id } }
    } })));
  users = {};
  tokens = {};
  for (const role of [...roles, 'unknown']) {
    users[role] = await app.prisma.user.create({ data: {
      email: `${role}@example.test`, passwordHash: 'unused', status: 'active', role,
      ...(role === 'chef' ? { chefId: chefs[0].id } : {})
    } });
    tokens[role] = issuer.issue(users[role].id);
  }
});
after(async () => { await app?.close(); });

function call(role, path, options = {}) {
  return app.call(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${tokens[role]}` } });
}
function ids(response) { return response.body.data.map((item) => item.id).sort((a, b) => a - b); }

test('authenticated role matrix denies direct access to restricted collections and writes', async () => {
  const reads = [
    ['/api/dishes', roles],
    ['/api/ingredients', ['admin', 'manager', 'chef']],
    ['/api/chefs', ['admin', 'manager', 'chef']],
    [`/api/dishes/${dishes[0].id}/ingredients`, ['admin', 'manager', 'chef']],
    [`/api/chefs/${chefs[0].id}/dishes`, ['admin', 'manager', 'chef']],
    ['/api/users', ['admin']]
  ];
  for (const [path, allowed] of reads) {
    for (const role of roles) {
      assert.equal((await call(role, path)).status, allowed.includes(role) ? 200 : 403, `${role} GET ${path}`);
    }
  }
  for (const role of ['chef', 'staff', 'customer', 'unknown']) {
    for (const [path, data] of [
      ['/api/dishes', { name: 'Forbidden dish', price: 1 }],
      ['/api/ingredients', { name: 'Forbidden ingredient', unit: 'g', stock: 1 }],
      ['/api/chefs', { name: 'Forbidden chef', specialty: 'Tea' }],
      [`/api/dishes/${dishes[0].id}/ingredients`, { ingredientId: ingredients[1].id, amount: 1 }],
      [`/api/chefs/${chefs[0].id}/dishes`, { dishId: dishes[1].id }]
    ]) {
      assert.equal((await call(role, path, { method: 'POST', data })).status, role === 'unknown' ? 401 : 403, `${role} POST ${path}`);
    }
  }
  assert.equal((await call('unknown', '/api/dishes')).status, 401);
  assert.equal((await app.call('/api/dishes')).status, 401);
  assert.equal(await app.prisma.dish.count(), 2);
  assert.equal(await app.prisma.ingredient.count(), 2);
  assert.equal(await app.prisma.chef.count(), 2);
  assert.equal(await app.prisma.dishIngredient.count(), 2);
  assert.equal(await app.prisma.chefDish.count(), 2);
});

test('direct patch and delete bypass attempts cannot change resources or relations', async () => {
  for (const role of ['chef', 'staff', 'customer']) {
    for (const [method, path, data] of [
      ['PATCH', `/api/dishes/${dishes[0].id}`, { price: 1 }],
      ['DELETE', `/api/dishes/${dishes[0].id}`],
      ['PATCH', `/api/ingredients/${ingredients[0].id}`, { stock: 0 }],
      ['DELETE', `/api/ingredients/${ingredients[0].id}`],
      ['PATCH', `/api/chefs/${chefs[0].id}`, { name: 'Changed' }],
      ['DELETE', `/api/chefs/${chefs[0].id}`],
      ['PATCH', `/api/dishes/${dishes[0].id}/ingredients/${ingredients[0].id}`, { amount: 99 }],
      ['DELETE', `/api/dishes/${dishes[0].id}/ingredients/${ingredients[0].id}`],
      ['DELETE', `/api/chefs/${chefs[0].id}/dishes/${dishes[0].id}`]
    ]) assert.equal((await call(role, path, { method, data })).status, 403, `${role} ${method} ${path}`);
  }
  assert.equal((await app.prisma.dish.findUnique({ where: { id: dishes[0].id } })).price, 100);
  assert.equal((await app.prisma.ingredient.findUnique({ where: { id: ingredients[0].id } })).stock, 100);
  assert.equal((await app.prisma.chef.findUnique({ where: { id: chefs[0].id } })).name, 'Assigned chef');
  assert.equal(await app.prisma.dishIngredient.count(), 2);
  assert.equal(await app.prisma.chefDish.count(), 2);
});

test('current user and account list do not expose credential data', async () => {
  for (const role of roles) {
    const me = await call(role, '/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(JSON.stringify(me.body).includes('passwordHash'), false);
  }
  const accounts = await call('admin', '/api/users');
  assert.equal(accounts.status, 200);
  assert.equal(JSON.stringify(accounts.body).includes('passwordHash'), false);
  assert.equal(JSON.stringify(accounts.body).includes('unused'), false);
});

test('admin account lookup matches normalized email without exposing credentials', async () => {
  const response = await call('admin', '/api/users?email=%20customer%40EXAMPLE.TEST%20');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.total, 1);
  assert.deepEqual(response.body.data.items.map(user => user.id), [users.customer.id]);
  assert.equal(JSON.stringify(response.body).includes('passwordHash'), false);
  assert.equal((await call('admin', '/api/users?email=missing%40example.test')).body.data.total, 0);
  assert.equal((await call('admin', '/api/users?email=invalid')).status, 400);
  assert.equal((await call('admin', '/api/users?email=a%40example.test&email=b%40example.test')).status, 400);
  for (const role of ['manager', 'chef', 'staff', 'customer']) {
    assert.equal((await call(role, '/api/users?email=customer%40example.test')).status, 403);
  }
});

test('customer and chef scopes apply to list, paging, detail and relation traversal', async () => {
  assert.deepEqual(ids(await call('customer', '/api/dishes')), [dishes[0].id]);
  const customerDish = await call('customer', `/api/dishes/${dishes[0].id}`);
  assert.equal(customerDish.status, 200);
  assert.equal(Object.hasOwn(customerDish.body.data, 'ingredients'), false);
  assert.equal(Object.hasOwn(customerDish.body.data, 'chefs'), false);
  assert.equal((await call('customer', `/api/dishes/${dishes[1].id}`)).status, 404);
  const page = await call('customer', '/api/dishes/paged');
  assert.equal(page.body.data.total, 1);
  assert.deepEqual(ids(await call('chef', '/api/dishes')), [dishes[0].id]);
  assert.deepEqual(ids(await call('chef', '/api/ingredients')), [ingredients[0].id]);
  assert.deepEqual(ids(await call('chef', '/api/chefs')), [chefs[0].id]);
  for (const path of [
    `/api/dishes/${dishes[1].id}`,
    `/api/dishes/${dishes[1].id}/ingredients`,
    `/api/dishes/${dishes[1].id}/ingredients/${ingredients[1].id}`,
    `/api/ingredients/${ingredients[1].id}`,
    `/api/chefs/${chefs[1].id}`,
    `/api/chefs/${chefs[1].id}/dishes`,
    `/api/chefs/${chefs[0].id}/dishes/${dishes[1].id}`
  ]) assert.equal((await call('chef', path)).status, 404, path);
  assert.equal((await call('chef', `/api/dishes/${dishes[0].id}/ingredients/${ingredients[0].id}`)).status, 200);
});

test('chef availability writes are isolated, scoped, and reject mixed fields', async () => {
  const dishPath = `/api/dishes/${dishes[0].id}`;
  for (const [path, data] of [
    [dishPath, { price: 1 }],
    [dishPath, { available: false }],
    [dishPath + '/availability', { available: false, price: 1 }],
    [dishPath + '/availability', { available: false, role: 'admin' }]
  ]) {
    const result = await call('chef', path, { method: 'PATCH', data });
    assert.ok(result.status >= 400 || result.body.ok === false, path);
    const persisted = await app.prisma.dish.findUnique({ where: { id: dishes[0].id } });
    assert.equal(persisted.price, 100);
    assert.equal(persisted.available, true);
  }
  assert.equal((await call('chef', `/api/dishes/${dishes[1].id}/availability`, { method: 'PATCH', data: { available: true } })).status, 404);
  const changed = await call('chef', dishPath + '/availability', { method: 'PATCH', data: { available: false } });
  assert.equal(changed.status, 200);
  assert.equal((await app.prisma.dish.findUnique({ where: { id: dishes[0].id } })).available, false);
  await app.prisma.dish.update({ where: { id: dishes[0].id }, data: { available: true } });
});

test('issued tokens reflect role, status, chef link and assignment changes immediately', async () => {
  assert.equal((await call('manager', '/api/ingredients')).status, 200);
  await app.prisma.user.update({ where: { id: users.manager.id }, data: { role: 'customer' } });
  assert.equal((await call('manager', '/api/ingredients')).status, 403);
  assert.equal((await call('manager', '/api/dishes', { method: 'POST', data: { name: 'Escalated', price: 1, role: 'admin' } })).status, 403);
  await app.prisma.user.update({ where: { id: users.manager.id }, data: { role: 'manager', status: 'pending' } });
  assert.equal((await call('manager', '/api/dishes')).status, 401);
  await app.prisma.user.update({ where: { id: users.manager.id }, data: { status: 'active' } });
  await app.prisma.chefDish.delete({ where: { chefId_dishId: { chefId: chefs[0].id, dishId: dishes[0].id } } });
  assert.equal((await call('chef', `/api/dishes/${dishes[0].id}`)).status, 404);
  assert.deepEqual(ids(await call('chef', '/api/ingredients')), []);
  await app.prisma.chefDish.create({ data: { chefId: chefs[0].id, dishId: dishes[0].id } });
  await app.prisma.user.update({ where: { id: users.chef.id }, data: { chefId: null } });
  assert.deepEqual(ids(await call('chef', '/api/dishes')), []);
  assert.equal((await call('chef', `/api/dishes/${dishes[0].id}`)).status, 404);
  await app.prisma.user.update({ where: { id: users.chef.id }, data: { chefId: chefs[0].id } });
});

test('only admins manage accounts, and concurrent demotions preserve an admin', async () => {
  for (const role of ['manager', 'chef', 'staff', 'customer']) {
    assert.equal((await call(role, `/api/users/${users[role].id}/role`, { method: 'PATCH', data: { role: 'admin' } })).status, 403);
    assert.equal((await call(role, `/api/users/${users[role].id}/chef`, { method: 'PATCH', data: { chefId: chefs[1].id } })).status, 403);
  }
  assert.equal((await call('admin', `/api/users/${users.admin.id}/role`, { method: 'PATCH', data: { role: 'staff' } })).status === 200 &&
    (await app.prisma.user.findUnique({ where: { id: users.admin.id } })).role === 'staff', false);
  assert.equal((await app.prisma.user.findUnique({ where: { id: users.admin.id } })).role, 'admin');
  const secondAdmin = await app.prisma.user.create({ data: { email: 'second-admin@example.test', passwordHash: 'unused', status: 'active', role: 'admin' } });
  const secondToken = issuer.issue(secondAdmin.id);
  const [first, second] = await Promise.all([
    call('admin', `/api/users/${secondAdmin.id}/role`, { method: 'PATCH', data: { role: 'staff' } }),
    app.call(`/api/users/${users.admin.id}/role`, {
      method: 'PATCH', data: { role: 'staff' }, headers: { Authorization: `Bearer ${secondToken}` }
    })
  ]);
  assert.ok(first.status !== 200 || first.body.ok === false || second.status !== 200 || second.body.ok === false);
  assert.ok(await app.prisma.user.count({ where: { role: 'admin', status: 'active' } }) >= 1);
});

test('manager and admin writes persist, and admin controls chef links', async () => {
  const admin = await app.prisma.user.findFirst({ where: { role: 'admin', status: 'active' } });
  const adminToken = issuer.issue(admin.id);
  for (const token of [tokens.manager, adminToken]) {
    const response = await app.call('/api/dishes', {
      method: 'POST', data: { name: 'Operator dish', price: 250 }, headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200);
    assert.equal((await app.prisma.dish.findUnique({ where: { id: response.body.data.id } })).price, 250);
  }
  const headers = { Authorization: `Bearer ${adminToken}` };
  for (const user of [users.staff, users.customer]) {
    const promoted = await app.call(`/api/users/${user.id}/role`, { method: 'PATCH', data: { role: 'chef' }, headers });
    assert.equal(promoted.status, 200);
    assert.equal((await app.prisma.user.findUnique({ where: { id: user.id } })).role, 'chef');
  }
  const link = await app.call(`/api/users/${users.staff.id}/chef`, { method: 'PATCH', data: { chefId: chefs[1].id }, headers });
  assert.equal(link.status, 200);
  assert.equal((await app.prisma.user.findUnique({ where: { id: users.staff.id } })).chefId, chefs[1].id);
  const duplicate = await app.call(`/api/users/${users.customer.id}/chef`, { method: 'PATCH', data: { chefId: chefs[1].id }, headers });
  assert.ok(duplicate.status >= 400 || duplicate.body.ok === false);
  assert.equal((await app.prisma.user.findUnique({ where: { id: users.customer.id } })).chefId, null);
});
