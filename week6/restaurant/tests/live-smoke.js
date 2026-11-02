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
    const get = (path) => fetch(origin + path);
    const menu = await get('/dishes');
    const menuHtml = await menu.text();
    assert.equal(menu.status, 200);
    assert.match(menuHtml, /Matcha Latte/);
    assert.match(menuHtml, /\/beverages\/matcha-latte\.jpeg/);
    const search = await get('/dishes?q=Houjicha&category=houjicha');
    assert.equal(search.status, 200);
    assert.match(await search.text(), /Houjicha Latte/);
    const first = await prisma.dish.findFirst({ where: { name: 'Matcha Latte' } });
    assert.ok(first);
    assert.equal((await get(`/dishes/${first.id}`)).status, 200);
    assert.equal((await get('/admin/dishes')).status, 200);
    assert.equal((await get('/admin/chefs')).status, 200);
    assert.equal((await get('/admin/ingredients')).status, 200);
    assert.equal((await get('/dishes/not-an-id')).status, 404);
    assert.equal((await get('/beverages/matcha-latte.jpeg')).status, 200);
    console.log('Live SSR smoke check passed (Supabase + EJS + Soucha assets).');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error('Live SSR smoke check failed:', error.message); process.exitCode = 1; });
