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
    await check('Smart search runs automatically without a mode picker or default/relevance sort options', async () => {
      await page.goto(origin + '/dishes');
      await count(12);
      assert.equal(await page.locator('#menu-mode').count(), 0);
      assert.equal(await page.locator('#menu-sort').inputValue(), '');
      const options = await page.locator('#menu-sort option:not([hidden])').allTextContents();
      assert.equal(options.includes('Mặc định'), false);
      assert.equal(options.includes('Liên quan nhất'), false);
      assert.equal(await page.locator('#menu-sort option[value=""]').isDisabled(), true);
      await page.getByRole('searchbox').fill('ceremonial vani');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await count(12);
      assert.match(await page.locator('.result-count').innerText(), /\/ 40 món/);
      assert.match(await page.locator('.dish-card').first().innerText(), /Ceremonial Vani/);
      assert.equal(requests.at(-1).searchParams.get('mode'), 'smart');
      assert.equal(await page.locator('#menu-sort').inputValue(), '');
      await page.locator('#menu-sort').selectOption('price-desc');
      await count(12);
      assert.equal(new URL(page.url()).searchParams.get('sort'), 'price-desc');
      assert.doesNotMatch(await page.locator('.dish-card').first().innerText(), /Ceremonial Vani/);
      await page.goto(origin + '/dishes?mode=smart&q=ceremonial+vani');
      await count(12);
    });
    await check('Automatic search/query survive numbered navigation and reload; ordering stays stable', async () => {
      await page.getByRole('link', { name: 'Trang 2', exact: true }).click();
      await count(12);
      assert.equal(new URL(page.url()).searchParams.get('mode'), 'smart');
      const before = await page.locator('.dish-card').evaluateAll((cards) => cards.map((card) => card.dataset.dishId));
      await page.reload();
      await count(12);
      assert.equal(await page.locator('#menu-mode').count(), 0);
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
      await count(12);
      assert.equal(requests.at(-1).searchParams.get('mode'), 'smart');
      assert.equal(await page.getByRole('searchbox').inputValue(), '');
    });
    await check('Load More and Infinite Scroll use actual fulltext SQL and stop at total', async () => {
      await page.goto(origin + '/dishes?view=more&q=ceremonial+vani&pageSize=12');
      await count(12);
      await page.locator('[data-load-next]').click();
      await count(24);
      assert.equal(requests.at(-1).searchParams.get('mode'), 'smart');
      await page.locator('[data-view=infinite]').click();
      await count(12);
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
      await page.goto(origin + '/dishes?q=ceremonial+vani');
      await count(12);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'fulltext-mobile.png'), fullPage: true });
    });
    await check('Default smart search finds Houjicha Cold Whisk across omitted words and typos in all three views', async () => {
      await db.query('INSERT INTO dishes (name,description,price,category,available) VALUES ($1,NULL,45000,$2,true)', ['Houjicha Cold Whisk', 'houjicha']);
      await db.query('INSERT INTO dishes (name,description,price,category,available) VALUES ($1,NULL,40000,$2,true)', ['Houjicha Roasted Whisk', 'houjicha']);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(origin + '/dishes');
      await count(12);
      assert.equal(await page.locator('#menu-mode').count(), 0);
      for (const q of ['houjicha whisk', 'houjcha whsk', 'houjcha whsik']) {
        await page.getByRole('searchbox').fill(q);
        await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
        await count(2);
        assert.match(await page.locator('.dish-card').first().innerText(), /Houjicha Cold Whisk/);
        assert.equal(await page.locator('.search-match-note').count(), q === 'houjicha whisk' ? 0 : 2);
      }
      await page.getByRole('searchbox').fill('');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await count(12);
      assert.equal(await page.locator('[data-state="error"]').count(), 0);
      assert.equal(new URL(page.url()).searchParams.has('sort'), false);
      await page.locator('#menu-pageSize').selectOption('12');
      await page.goto(origin + '/dishes?q=houjcha+whsk&pageSize=12');
      await count(2);
      await page.reload();
      await count(2);
      assert.equal(requests.at(-1).searchParams.get('mode'), 'smart');
      await page.locator('[data-view=more]').click();
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
      await page.goto(origin + '/dishes?q=houjicha+whisk&page=1');
      await count(2);
      assert.equal(new URL(page.url()).searchParams.get('page'), '1');
    });
    await check('Vietnamese accents and edit distance distinguish Bánh bò from Cơm bò; rearranged letters are labeled suggestions', async () => {
      await db.query('INSERT INTO dishes (name,price) VALUES ($1,15000),($2,40000)', ['Bánh bò', 'Cơm bò']);
      await page.goto(origin + '/dishes?q=houcha');
      await count(2);
      assert.match(await page.locator('.dish-card').first().innerText(), /Houjicha Cold Whisk/);
      await page.goto(origin + '/dishes?q=kswh&pageSize=12&view=more');
      await count(2);
      assert.match(await page.locator('.search-match-note').first().innerText(), /Gợi ý theo ký tự/);
      assert.equal(await page.locator('[data-load-next]').isDisabled(), true);
      for (const q of ['báh bì', 'bah bi', 'banh bo', 'bánh bò'.normalize('NFD')]) {
        await page.getByRole('searchbox').fill(q);
        await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
        await count(1);
        assert.equal(await page.locator('.dish-card h3').innerText(), 'Bánh bò');
      }
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'smart-vietnamese-typo.png'), fullPage: true });
    });
    await check('chatma retrieves the entire Matcha collection despite chất/chai distractors, with correction shown across all pagination views', async () => {
      for (let index = 0; index < 13; index++) await db.query('INSERT INTO dishes (name,price,category) VALUES ($1,30000,$2)', [`Matcha phiên bản ${index}`, 'matcha']);
      await db.query('INSERT INTO dishes (name,price,category) VALUES ($1,30000,$2)', ['Matcha 100% nguyên chất', 'matcha']);
      const distractor = (await db.query('INSERT INTO dishes (name,price,category) VALUES ($1,30000,$2) RETURNING id', ['Cà phê đóng chai', 'coffee'])).rows[0].id;
      const expected = (await db.query("SELECT id FROM dishes WHERE fts @@ plainto_tsquery('simple','matcha') ORDER BY id")).rows.map((row) => String(row.id));
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(origin + '/dishes?q=chatma&pageSize=12');
      await count(12);
      assert.match(await page.locator('[data-search-correction]').innerText(), /“matcha”/);
      assert.match(await page.locator('.result-count').innerText(), new RegExp(`/ ${expected.length} món`));
      assert.equal(await page.getByRole('searchbox').inputValue(), 'chatma');
      const ids = [];
      for (let current = 1; current <= Math.ceil(expected.length / 12); current++) {
        await count(Math.min(12, expected.length - (current - 1) * 12));
        ids.push(...await page.locator('.dish-card').evaluateAll((cards) => cards.map((card) => card.dataset.dishId)));
        if (current < Math.ceil(expected.length / 12)) {
          await page.getByRole('link', { name: 'Trang tiếp', exact: true }).click();
          await page.waitForURL((url) => url.searchParams.get('page') === String(current + 1));
        }
      }
      assert.equal(new Set(ids).size, expected.length);
      assert.deepEqual(ids.sort((a, b) => Number(a) - Number(b)), expected);
      assert.equal(ids.includes(String(distractor)), false);
      for (const view of ['more', 'infinite']) {
        await page.goto(origin + `/dishes?view=${view}&q=chatma&pageSize=12`);
        await count(12);
        let visible = 12;
        while (visible < expected.length) {
          if (view === 'more') await page.locator('[data-load-next]').click();
          else await page.locator('.pagination-sentinel').scrollIntoViewIfNeeded();
          visible = Math.min(visible + 12, expected.length);
          await count(visible);
        }
        const appended = await page.locator('.dish-card').evaluateAll((cards) => cards.map((card) => card.dataset.dishId));
        assert.deepEqual(appended.sort((a, b) => Number(a) - Number(b)), expected);
        assert.equal(await page.locator('[data-load-next]').isDisabled(), true);
        assert.match(await page.locator('[data-search-correction]').innerText(), /“matcha”/);
      }
      await page.getByRole('searchbox').fill('');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await count(12);
      assert.equal(await page.locator('[data-search-correction]').isVisible(), false);
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
