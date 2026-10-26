const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixture } = require('./helpers');
const { generateBeverages } = require('../api/prisma/demo-beverages');

async function main() {
  const app = await fixture();
  let browser;
  let page;
  const results = [];
  const output = path.join(__dirname, 'results');
  fs.mkdirSync(output, { recursive: true });
  try {
    const generated = generateBeverages();
    const sample = ['coffee', 'matcha', 'houjicha'].flatMap((category, index) => generated.filter((row) => row.category === category).slice(0, [20, 11, 8][index]));
    sample[0] = { ...sample[0], price: 0, available: false };
    await app.prisma.dish.createMany({ data: sample });
    const records = await app.prisma.dish.findMany({ orderBy: { id: 'asc' } });
    const origin = await app.startWeb();
    browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    const documents = [];
    const network = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.resourceType() === 'document') documents.push(request.url());
      if (request.url().startsWith(app.apiUrl + '/api/dishes/paged?')) network.push(new URL(request.url()));
    });
    const ready = () => page.waitForFunction(() => document.querySelector('[data-menu-grid]')?.getAttribute('aria-busy') === 'false');
    const count = async (size) => {
      await page.waitForFunction((size) => document.querySelectorAll('.dish-card').length === size && document.querySelector('[data-menu-grid]')?.getAttribute('aria-busy') === 'false', size);
    };
    const ids = () => page.locator('.dish-card').evaluateAll((cards) => cards.map((card) => Number(card.dataset.dishId)));
    async function check(name, run) {
      await run();
      results.push({ name, passed: true });
      console.log('PASS:', name);
    }
    await check('Numbered pagination restores URL, reload, copied link and Back/Forward without document navigation', async () => {
      const expected = [...records].sort((a, b) => a.price - b.price || a.id - b.id);
      await page.goto(origin + '/dishes?view=pages&page=2&pageSize=10&sort=price-asc');
      await count(10);
      assert.deepEqual(await ids(), expected.slice(10, 20).map((row) => row.id));
      assert.match(await page.locator('.result-count').innerText(), /11–20 \/ 39/);
      assert.equal(await page.locator('.numbered-pagination [aria-current="page"]').innerText(), '2');
      await page.reload();
      await count(10);
      assert.deepEqual(await ids(), expected.slice(10, 20).map((row) => row.id));
      const copy = await context.newPage();
      await copy.goto(page.url());
      await copy.waitForFunction(() => document.querySelector('[data-menu-grid]')?.getAttribute('aria-busy') === 'false');
      assert.equal(await copy.locator('.numbered-pagination [aria-current="page"]').innerText(), '2');
      await copy.close();
      const docs = documents.length;
      await page.getByRole('link', { name: 'Trang 3', exact: true }).click();
      await page.waitForURL(/page=3/);
      await count(10);
      assert.deepEqual(await ids(), expected.slice(20, 30).map((row) => row.id));
      await page.goBack();
      await count(10);
      assert.deepEqual(await ids(), expected.slice(10, 20).map((row) => row.id));
      await page.goForward();
      await count(10);
      assert.deepEqual(await ids(), expected.slice(20, 30).map((row) => row.id));
      assert.equal(documents.length, docs);
      await page.screenshot({ path: path.join(output, 'pagination-numbered-desktop.png'), fullPage: true });
    });
    await check('Search/filter/sort reset page one, preserve conditions, and handle false and zero', async () => {
      await page.getByRole('searchbox').fill('Matcha');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await count(10);
      assert.equal(new URL(page.url()).searchParams.get('page'), '1');
      await page.getByRole('link', { name: 'Trang 2', exact: true }).click();
      await count(1);
      assert.equal(new URL(page.url()).searchParams.get('q'), 'Matcha');
      await page.locator('#menu-sort').selectOption('name-desc');
      await count(10);
      assert.equal(new URL(page.url()).searchParams.get('page'), '1');
      await page.getByRole('link', { name: 'Xóa bộ lọc' }).click();
      await count(10);
      await page.locator('#menu-minPrice').fill('0');
      await page.locator('#menu-maxPrice').fill('0');
      await page.locator('#menu-available').selectOption('false');
      await count(1);
      const url = new URL(page.url());
      assert.equal(url.searchParams.get('minPrice'), '0');
      assert.equal(url.searchParams.get('maxPrice'), '0');
      assert.equal(url.searchParams.get('available'), 'false');
      assert.deepEqual(await ids(), [records[0].id]);
    });
    await check('Load More accumulates, prevents duplicate pending requests and ends on a full final page', async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      let requests = 0;
      await page.route('**/api/dishes/paged?**', async (route) => {
        if (new URL(route.request().url()).searchParams.get('page') !== '2') return route.continue();
        requests++;
        await gate;
        try { await route.continue(); } catch { /* canceled on navigation */ }
      });
      const second = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/dishes/paged' && new URL(request.url()).searchParams.get('page') === '2');
      await page.goto(origin + '/dishes?view=more&category=coffee&pageSize=10');
      await count(10);
      const docs = documents.length;
      await page.locator('[data-load-next]').click();
      await second;
      assert.equal(await page.locator('[data-load-next]').isDisabled(), true);
      await page.locator('[data-load-next]').evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      release();
      await count(20);
      assert.equal(requests, 1);
      assert.equal(new Set(await ids()).size, 20);
      assert.equal(await page.locator('[data-load-next]').isDisabled(), true);
      assert.equal(await page.locator('.pagination-end').count(), 1);
      assert.equal(documents.length, docs);
      await page.unroute('**/api/dishes/paged?**');
      await page.reload();
      await count(10);
      assert.match(await page.locator('.pagination-policy').innerText(), /tải từ đầu/);
    });
    await check('A failed next page preserves cards and retries exactly that page', async () => {
      let attempts = 0;
      let allowSuccess = false;
      await page.route('**/api/dishes/paged?**', async (route) => {
        if (new URL(route.request().url()).searchParams.get('page') === '2') {
          attempts++;
          if (!allowSuccess) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        }
        return route.continue();
      });
      await page.goto(origin + '/dishes?view=more&pageSize=10');
      await count(10);
      const firstIds = await ids();
      await page.locator('[data-load-next]').click();
      await page.locator('[data-state="error"]').waitFor();
      assert.deepEqual(await ids(), firstIds);
      assert.equal(await page.locator('[data-load-next]').innerText(), 'Thử tải lại');
      allowSuccess = true;
      await page.locator('[data-load-next]').click();
      await count(20);
      assert.ok(attempts >= 2);
      assert.deepEqual((await ids()).slice(0, 10), firstIds);
      await page.unroute('**/api/dishes/paged?**');
    });
    await check('Changing criteria aborts stale append responses instead of mixing two result sets', async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      await page.route('**/api/dishes/paged?**', async (route) => {
        if (new URL(route.request().url()).searchParams.get('page') === '2') await gate;
        try { await route.continue(); } catch { /* deliberately canceled */ }
      });
      const pending = page.waitForRequest((request) => request.url().includes('/paged?') && new URL(request.url()).searchParams.get('page') === '2');
      await page.goto(origin + '/dishes?view=more&pageSize=10');
      await count(10);
      await page.locator('[data-load-next]').click();
      await pending;
      await page.locator('#menu-category').selectOption('houjicha');
      await count(8);
      release();
      await page.unroute('**/api/dishes/paged?**');
      assert.deepEqual(await ids(), records.filter((row) => row.category === 'houjicha').map((row) => row.id));
      assert.equal(await page.locator('[data-load-next]').isDisabled(), true);
    });
    await check('Infinite Scroll loads all pages without duplicate IDs and disconnects on route exit', async () => {
      const start = network.length;
      await page.goto(origin + '/dishes?view=infinite&pageSize=10');
      await count(10);
      while (await page.locator('.dish-card').count() < 39) {
        const before = await page.locator('.dish-card').count();
        await page.locator('.pagination-sentinel').scrollIntoViewIfNeeded();
        await page.waitForFunction((before) => document.querySelectorAll('.dish-card').length > before && document.querySelector('[data-menu-grid]')?.getAttribute('aria-busy') === 'false', before);
      }
      assert.deepEqual(await ids(), records.map((row) => row.id));
      assert.equal(new Set(await ids()).size, 39);
      assert.equal(await page.locator('[data-load-next]').isDisabled(), true);
      const pages = network.slice(start).map((url) => url.searchParams.get('page'));
      assert.deepEqual(pages, ['1', '2', '3', '4']);
      await page.screenshot({ path: path.join(output, 'pagination-infinite-end.png'), fullPage: false });
      await page.getByRole('link', { name: 'Quản trị', exact: true }).click();
      await page.locator('.admin-row').first().waitFor();
      const calls = network.length;
      await page.evaluate(() => new Promise((resolve) => { window.scrollTo(0, document.body.scrollHeight); requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
      assert.equal(network.length, calls);
    });
    await check('Short lists auto-fill the viewport sequentially and custom pageSize survives URL restore', async () => {
      await page.setViewportSize({ width: 1440, height: 2200 });
      const start = network.length;
      await page.goto(origin + '/dishes?view=infinite&pageSize=2');
      await page.waitForFunction(() => document.querySelectorAll('.dish-card').length > 2 && document.querySelector('[data-menu-grid]')?.getAttribute('aria-busy') === 'false' &&
        (document.querySelector('.pagination-sentinel').getBoundingClientRect().top > innerHeight + 200 || document.querySelector('[data-load-next]')?.disabled));
      assert.equal(await page.locator('#menu-pageSize').inputValue(), '2');
      const pages = network.slice(start).map((url) => url.searchParams.get('page'));
      assert.equal(pages[0], '1');
      assert.equal(new Set(pages).size, pages.length);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(origin + '/dishes?view=pages&pageSize=10');
      await count(10);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'pagination-mobile.png'), fullPage: true });
    });
    await check('Empty/out-of-range/invalid pages are visible and clear/reset controls recover', async () => {
      await page.goto(origin + '/dishes?page=99&pageSize=10');
      await ready();
      assert.match(await page.locator('[data-state="empty"]').innerText(), /Trang này chưa có món/);
      await page.getByRole('link', { name: 'Về trang đầu' }).click();
      await count(10);
      await page.getByRole('searchbox').fill('no-match-here');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await ready();
      assert.equal(await page.locator('.dish-card').count(), 0);
      assert.match(await page.locator('.result-count').innerText(), /0–0 \/ 0/);
      assert.equal(await page.locator('.numbered-pagination').count(), 0);
      await page.goto(origin + '/dishes?page=0');
      await page.locator('[data-state="error"]').waitFor();
      assert.equal(await page.locator('.dish-card').count(), 0);
    });
    await check('Prefetch hides 500ms network delay, keeps one request per page and preserves the load button', async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      let secondRequests = 0;
      await page.route('**/api/dishes/paged?**', async (route) => {
        if (new URL(route.request().url()).searchParams.get('page') === '2') {
          secondRequests++;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        try { await route.continue(); } catch { /* menu navigation may cancel prefetch */ }
      });
      const prefetched = page.waitForResponse((response) => response.url().includes('/paged?') && new URL(response.url()).searchParams.get('page') === '2');
      await page.goto(origin + '/dishes?view=more&pageSize=10');
      await count(10);
      await (await prefetched).finished();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const button = await page.locator('[data-load-next]').elementHandle();
      await page.locator('[data-load-next]').scrollIntoViewIfNeeded();
      const start = await page.evaluate(() => performance.now());
      await page.locator('[data-load-next]').click();
      await count(20);
      const elapsed = await page.evaluate((start) => performance.now() - start, start);
      assert.ok(elapsed < 300, `ready page took ${elapsed}ms to display`);
      assert.equal(secondRequests, 1);
      assert.equal(await button.evaluate((node) => node.isConnected), true);
      await page.unroute('**/api/dishes/paged?**');
      console.log('Prefetched append latency:', Math.round(elapsed), 'ms');
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'pagination-browser.json'), JSON.stringify({ results, pageErrors: errors }, null, 2));
    console.log(`${results.length} pagination browser checks passed.`);
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(output, 'pagination-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser?.close();
    await app.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
