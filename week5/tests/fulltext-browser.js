const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { postgres } = require('./postgres');
const { createApp } = require('../api/src/app');

async function main() {
  const db = postgres();
  let api, web, browser;
  const output = path.join(__dirname, 'results');
  fs.mkdirSync(output, { recursive: true });
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, '../api/sql/001-schema.sql'), 'utf8'));
    for (let index = 0; index < 40; index++) {
      await db.query('INSERT INTO dishes (name,description,price,category,available) VALUES ($1,$2,$3,$4,$5)', [
        index === 0 ? 'Ceremonial Vani' : `Món ${index + 1}`,
        index === 0 ? null : 'Matcha ceremonial được pha cùng sữa và hương vani.',
        index === 0 ? 0 : 30000, ['matcha', 'coffee', 'houjicha'][index % 3], index !== 0
      ]);
    }
    // The adapter only transports Prisma SQL to local PostgreSQL; search is not mocked.
    const prisma = { $queryRaw: async (query) => (await db.query(query.text, query.values)).rows };
    api = http.createServer().listen(0, '127.0.0.1');
    await once(api, 'listening');
    const { createWebServer } = await import('../web/server.js');
    web = createWebServer({ apiBaseUrl: `http://127.0.0.1:${api.address().port}/api` }).listen(0, '127.0.0.1');
    await once(web, 'listening');
    const origin = `http://127.0.0.1:${web.address().port}`;
    api.on('request', createApp({ prisma, spaOrigin: origin, logger: { error() {} } }));
    browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(12000);
    const errors = [], requests = [], results = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (request.url().includes('/api/dishes/paged?')) requests.push(new URL(request.url())); });
    const count = (number) => page.waitForFunction((number) => document.querySelectorAll('.dish-card').length === number && document.querySelector('[data-menu-grid]')?.getAttribute('aria-busy') === 'false', number);
    async function check(name, run) { await run(); results.push({ name, passed: true }); console.log('PASS:', name); }
    await check('Empty fulltext waits for input; name-only and fulltext return different result sets', async () => {
      await page.goto(origin + '/dishes');
      await count(10);
      const before = requests.length;
      await page.locator('#menu-mode').selectOption('fulltext');
      await page.locator('[data-state="waiting"]').waitFor();
      assert.equal(requests.length, before);
      await page.getByRole('searchbox').fill('ceremonial vani');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await count(10);
      assert.match(await page.locator('.result-count').innerText(), /\/ 40 món/);
      assert.match(await page.locator('.dish-card').first().innerText(), /Ceremonial Vani/);
      assert.equal(await page.locator('#menu-sort').isDisabled(), true);
      assert.equal(await page.locator('#menu-sort').inputValue(), 'relevance');
      await page.locator('#menu-mode').selectOption('basic');
      await count(1);
      assert.match(await page.locator('.result-count').innerText(), /\/ 1 món/);
      await page.locator('#menu-mode').selectOption('fulltext');
      await count(10);
    });
    await check('Fulltext mode/query survive numbered navigation and reload; rank ordering stays stable', async () => {
      await page.getByRole('link', { name: 'Trang 2', exact: true }).click();
      await count(10);
      assert.equal(new URL(page.url()).searchParams.get('mode'), 'fulltext');
      const before = await page.locator('.dish-card').evaluateAll((cards) => cards.map((card) => card.dataset.dishId));
      await page.reload();
      await count(10);
      assert.equal(await page.locator('#menu-mode').inputValue(), 'fulltext');
      assert.deepEqual(await page.locator('.dish-card').evaluateAll((cards) => cards.map((card) => card.dataset.dishId)), before);
      await page.screenshot({ path: path.join(output, 'fulltext-desktop.png'), fullPage: true });
    });
    await check('Fulltext combines zero/false filters and clear restores the default smart list', async () => {
      await page.locator('#menu-minPrice').fill('0');
      await page.locator('#menu-maxPrice').fill('0');
      await page.locator('#menu-available').selectOption('false');
      await count(1);
      assert.equal(new URL(page.url()).searchParams.get('page'), '1');
      await page.getByRole('link', { name: 'Xóa bộ lọc' }).click();
      await count(10);
      assert.equal(await page.locator('#menu-mode').inputValue(), 'smart');
      assert.equal(await page.getByRole('searchbox').inputValue(), '');
    });
    await check('Load More and Infinite Scroll use actual fulltext SQL and stop at total', async () => {
      await page.goto(origin + '/dishes?view=more&mode=fulltext&q=ceremonial+vani&pageSize=10');
      await count(10);
      await page.locator('[data-load-next]').click();
      await count(20);
      assert.equal(requests.at(-1).searchParams.get('mode'), 'fulltext');
      await page.locator('[data-view=infinite]').click();
      await count(10);
      while (await page.locator('.dish-card').count() < 40) {
        const before = await page.locator('.dish-card').count();
        await page.locator('.pagination-sentinel').scrollIntoViewIfNeeded();
        await page.waitForFunction((before) => document.querySelectorAll('.dish-card').length > before && document.querySelector('[data-menu-grid]')?.getAttribute('aria-busy') === 'false', before);
      }
      const ids = await page.locator('.dish-card').evaluateAll((cards) => cards.map((card) => card.dataset.dishId));
      assert.equal(new Set(ids).size, 40);
      assert.equal(await page.locator('[data-load-next]').isDisabled(), true);
    });
    await check('Fulltext has empty results and responsive mobile controls', async () => {
      await page.getByRole('searchbox').fill('absentxyz');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await count(0);
      await page.locator('[data-state="empty"]').waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(origin + '/dishes?mode=fulltext&q=ceremonial+vani');
      await count(10);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'fulltext-mobile.png'), fullPage: true });
    });
    await check('Default smart search finds Houjicha Cold Whisk across omitted words and typos in all three views', async () => {
      await db.query('INSERT INTO dishes (name,description,price,category,available) VALUES ($1,NULL,45000,$2,true)', ['Houjicha Cold Whisk', 'houjicha']);
      await db.query('INSERT INTO dishes (name,description,price,category,available) VALUES ($1,NULL,40000,$2,true)', ['Houjicha Roasted Whisk', 'houjicha']);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(origin + '/dishes');
      await count(10);
      assert.equal(await page.locator('#menu-mode').inputValue(), 'smart');
      for (const q of ['houjicha whisk', 'houjcha whsk', 'houjcha whsik']) {
        await page.getByRole('searchbox').fill(q);
        await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
        await count(2);
        assert.match(await page.locator('.dish-card').first().innerText(), /Houjicha Cold Whisk/);
        assert.equal(await page.locator('.search-match-note').count(), q === 'houjicha whisk' ? 0 : 2);
      }
      await page.getByRole('searchbox').fill('');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await count(10);
      assert.equal(await page.locator('[data-state="error"]').count(), 0);
      assert.equal(new URL(page.url()).searchParams.has('sort'), false);
      await page.locator('#menu-pageSize').selectOption('10');
      await page.goto(origin + '/dishes?q=houjcha+whsk&pageSize=1');
      await count(1);
      await page.getByRole('link', { name: 'Trang 2', exact: true }).click();
      await count(1);
      assert.match(await page.locator('.dish-card').innerText(), /Houjicha Roasted Whisk/);
      await page.reload();
      await count(1);
      assert.equal(await page.locator('#menu-mode').inputValue(), 'smart');
      await page.locator('[data-view=more]').click();
      await count(1);
      await page.locator('[data-load-next]').click();
      await count(2);
      assert.equal(await page.locator('[data-load-next]').isDisabled(), true);
      await page.locator('[data-view=infinite]').click();
      await page.locator('.pagination-sentinel').scrollIntoViewIfNeeded();
      await count(2);
      const ids = await page.locator('.dish-card').evaluateAll((cards) => cards.map((card) => card.dataset.dishId));
      assert.equal(new Set(ids).size, 2);
      assert.equal(requests.at(-1).searchParams.get('mode'), 'smart');
      await page.getByRole('searchbox').fill('houjicha zzzzz');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await page.locator('[data-state="empty"]').waitFor();
      await page.goto(origin + '/dishes?mode=basic&q=houjicha+whisk');
      await page.locator('[data-state="empty"]').waitFor();
      await page.locator('#menu-mode').selectOption('smart');
      await count(2);
      assert.equal(new URL(page.url()).searchParams.get('page'), '1');
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'fulltext-browser.json'), JSON.stringify({ results, pageErrors: errors }, null, 2));
    console.log(`${results.length} fulltext browser checks passed.`);
  } finally {
    await browser?.close();
    for (const server of [web, api].filter(Boolean)) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await db.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
