require('dotenv').config();
const assert = require('node:assert/strict');
const { PrismaClient } = require('../generated/prisma');
const { createApp } = require('../src/app');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the live smoke check.');
  const prisma = new PrismaClient();
  const server = createApp({ prisma }).listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const spaOrigin = String(process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
    const get = (path, headers = {}) => fetch(origin + path, { headers });
    const menu = await get('/api/dishes', { Origin: spaOrigin });
    assert.equal(menu.status, 200);
    assert.equal(menu.headers.get('access-control-allow-origin'), spaOrigin);
    const menuBody = await menu.json();
    assert.equal(menuBody.ok, true);
    const matcha = menuBody.data.find((dish) => dish.name === 'Matcha Latte');
    assert.ok(matcha);
    assert.equal(matcha.image, '/beverages/matcha-latte.jpeg');
    const search = await get('/api/dishes?q=Houjicha&category=houjicha');
    const searchBody = await search.json();
    assert.equal(search.status, 200);
    assert.ok(searchBody.data.some((dish) => dish.name === 'Houjicha Latte'));
    const first = await prisma.dish.findFirst({ where: { name: 'Matcha Latte' } });
    assert.ok(first);
    const detail = await get(`/api/dishes/${first.id}`);
    assert.equal((await detail.json()).ok, true);
    assert.equal((await (await get('/api/chefs')).json()).ok, true);
    assert.equal((await (await get('/api/ingredients')).json()).ok, true);
    const missing = await get('/api/dishes/not-an-id');
    assert.equal(missing.status, 200);
    assert.equal((await missing.json()).error.code, 'NOT_FOUND');
    const unknown = await get('/api/not-a-resource');
    assert.equal(unknown.status, 404);
    assert.doesNotMatch(await unknown.text(), /"ok"/);
    console.log('Live API smoke check passed (Supabase + CORS).');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error('Live API smoke check failed:', error.message); process.exitCode = 1; });
