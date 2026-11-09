const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixture } = require('./helpers');
const { drinks } = require('../api/src/soucha-menu');

async function main() {
  const app = await fixture();
  const results = [];
  const output = path.join(__dirname, 'results');
  fs.mkdirSync(output, { recursive: true });
  let browser;
  try {
    for (const drink of drinks) await app.prisma.dish.create({ data: { ...drink, description: 'Trà thơm, vị dịu nhẹ.', available: true } });
    const chef = await app.prisma.chef.create({ data: { name: 'Nguyễn Minh An', specialty: 'Pha trà' } });
    const ingredient = await app.prisma.ingredient.create({ data: { name: 'Bột matcha', unit: 'g', stock: 500 } });
    await app.prisma.dishIngredient.create({ data: { dishId: 1, ingredientId: ingredient.id, amount: 10 } });
    await app.prisma.chefDish.create({ data: { chefId: chef.id, dishId: 1 } });
    const origin = await app.startWeb();
    browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    const documents = [];
    const network = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (req) => { if (req.resourceType() === 'document') documents.push(req.url()); });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    cdp.on('Network.requestWillBeSent', ({ request, type }) => {
      if (request.url.startsWith(app.apiUrl)) network.push({ method: request.method, url: request.url, type });
    });
    async function check(name, fn) {
      try { await fn(); }
      catch (error) {
        fs.writeFileSync(path.join(output, 'browser-failure.json'), JSON.stringify({ name, url: page.url(), errors, content: await page.locator('main').innerText() }, null, 2));
        await page.screenshot({ path: path.join(output, 'browser-failure.png'), fullPage: true });
        throw error;
      }
      results.push({ name, passed: true });
      console.log('PASS:', name);
    }
    const ready = () => page.locator('[data-state="loading"]').waitFor({ state: 'detached' });
    const chooseSearchOption = async (input, id) => {
      await input.click();
      const list = page.locator('#' + await input.getAttribute('aria-controls'));
      await list.locator(`[role="option"][data-value="${id}"]`).click();
    };
    await check('Menu, query q, empty state, detail, Back/Forward; navigation sends no documents', async () => {
      // This legacy CRUD suite runs on SQLite; PostgreSQL smart search has its own browser suite.
      await page.goto(origin + '/dishes?mode=basic');
      await page.locator('.dish-card').first().waitFor();
      assert.equal(await page.locator('.dish-card').count(), 8);
      await page.screenshot({ path: path.join(output, 'menu-desktop.png'), fullPage: true });
      const count = documents.length;
      await page.getByRole('searchbox').fill('hOuJiChA');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await ready();
      assert.match(page.url(), /q=hOuJiChA/);
      assert.equal(await page.locator('.dish-card').count(), 2);
      await page.locator('.dish-card h3 a').first().click();
      await page.locator('.dish-detail').waitFor();
      assert.equal(documents.length, count);
      await page.goBack();
      await page.locator('.dish-card').first().waitFor();
      assert.equal(await page.locator('.dish-card').count(), 2);
      await page.goForward();
      await page.locator('.dish-detail').waitFor();
      await page.locator('.back').click();
      // Empty-list coverage on SQLite; smart text search is covered on PostgreSQL.
      await page.locator('#menu-maxPrice').fill('0');
      await page.getByRole('button', { name: 'Tìm món', exact: true }).click();
      await page.locator('[data-state="empty"]').waitFor();
      assert.equal(documents.length, count);
    });
    await check('Required and relationship URLs open directly and reload correctly (21 URLs)', async () => {
      const routes = ['/dishes', '/dishes/1'];
      for (const [resource, id] of [['dishes', 1], ['chefs', chef.id], ['ingredients', ingredient.id]]) {
        routes.push(`/admin/${resource}`, `/admin/${resource}/new`, `/admin/${resource}/${id}/edit`, `/admin/${resource}/${id}/delete`);
      }
      routes.push('/unknown-page');
      routes.push('/admin/dishes/1', `/admin/chefs/${chef.id}`, '/admin/dishes/1/ingredients/new', `/admin/dishes/1/ingredients/${ingredient.id}/edit`, `/admin/dishes/1/ingredients/${ingredient.id}/delete`, `/admin/chefs/${chef.id}/dishes/1/delete`);
      for (const route of routes) {
        assert.equal((await page.goto(origin + route)).status(), 200);
        await ready();
        assert.equal(await page.locator('[data-state="error"]').count(), 0, route);
        if (route !== '/unknown-page') assert.equal(await page.locator('[data-state="notFound"]').count(), 0, route);
        if (route.endsWith('/new') && !route.includes('/ingredients/new')) await page.locator('#name').waitFor();
        assert.equal((await page.reload()).status(), 200);
        await ready();
        assert.ok((await page.locator('main').innerText()).length > 20, route);
      }
    });
    for (const [resource, extra] of [['dishes', { price: '42000' }], ['chefs', { specialty: 'Trà xanh' }], ['ingredients', { unit: 'g', stock: '10' }]]) {
      await check(`${resource}: create / edit / confirm or cancel delete, field errors, fresh data and no document reload`, async () => {
        await page.goto(origin + `/admin/${resource}/new`);
        const count = documents.length;
        const name = `Bài kiểm tra ${resource}`;
        await page.locator('#name').fill(name);
        for (const [key, value] of Object.entries(extra)) await page.locator('#' + key).fill(value);
        const response = page.waitForResponse((res) => res.url() === app.apiUrl + '/api/' + resource && res.request().method() === 'POST');
        await page.locator('button[type="submit"]').click();
        const created = (await (await response).json()).data;
        const id = created.id;
        await page.waitForURL(origin + (resource === 'dishes' ? `/dishes/${id}` : `/admin/${resource}`));
        await ready();
        assert.ok((await page.locator('main').innerText()).includes(name));
        assert.equal(documents.length, count);
        // Open edit by client navigation, ensuring the page reads the record again.
        if (resource === 'dishes') await page.getByRole('link', { name: 'Chỉnh sửa món' }).click();
        else await page.locator('.admin-row').filter({ hasText: name }).getByRole('link', { name: 'Sửa', exact: true }).click();
        await page.locator('#name').waitFor();
        assert.equal(await page.locator('#name').inputValue(), name);
        await page.locator('#name').fill('');
        await page.locator('button[type="submit"]').click();
        assert.ok((await page.locator('#name-error').innerText()).length);
        const renamed = name + ' đã sửa';
        await page.locator('#name').fill(renamed);
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(origin + (resource === 'dishes' ? `/dishes/${id}` : `/admin/${resource}`));
        await ready();
        assert.ok((await page.locator('main').innerText()).includes(renamed));
        assert.equal(documents.length, count);
        if (resource === 'dishes') {
          await page.getByRole('link', { name: 'Quản trị', exact: true }).click();
          await ready();
        }
        const row = () => page.locator('.admin-row').filter({ hasText: renamed });
        const deletionsBefore = network.filter((req) => req.method === 'DELETE').length;
        await row().getByRole('link', { name: 'Xóa', exact: true }).click();
        await page.locator('.delete-panel').waitFor();
        await page.getByRole('link', { name: 'Hủy, giữ bản ghi' }).click();
        await ready();
        assert.equal(network.filter((req) => req.method === 'DELETE').length, deletionsBefore);
        assert.equal((await app.call(`/api/${resource}/${id}`)).body.ok, true);
        await row().getByRole('link', { name: 'Xóa', exact: true }).click();
        await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
        await page.waitForURL(origin + `/admin/${resource}`);
        await ready();
        assert.equal((await app.call(`/api/${resource}/${id}`)).body.error.code, 'NOT_FOUND');
        assert.equal(await row().count(), 0);
        assert.equal(documents.length, count);
      });
    }
    await check('Week-3 category and price sort persist in URL and work without document reload', async () => {
      await page.goto(origin + '/dishes');
      await page.locator('.dish-card').first().waitFor();
      const docs = documents.length;
      await page.locator('#menu-category').selectOption('houjicha');
      await ready();
      assert.equal(await page.locator('.dish-card').count(), 2);
      assert.match(page.url(), /category=houjicha/);
      await page.locator('#menu-sort').selectOption('price-asc');
      await ready();
      assert.match(await page.locator('.dish-card').first().innerText(), /Houjicha Latte/);
      assert.match(page.url(), /sort=price-asc/);
      await page.reload();
      await ready();
      assert.equal(await page.locator('#menu-category').inputValue(), 'houjicha');
      assert.equal(await page.locator('#menu-sort').inputValue(), 'price-asc');
      assert.equal(documents.length, docs + 1);
    });
    await check('Inventory dropdown filters typed Vietnamese/unsigned search, keyboard choice, empty results and saved recipe IDs', async () => {
      const sugar = await app.prisma.ingredient.create({ data: { name: 'Đường nâu tìm kiếm', unit: 'g', stock: 200 } });
      const milk = await app.prisma.ingredient.create({ data: { name: 'Sữa tươi tìm kiếm', unit: 'ml', stock: 800 } });
      const dish = await app.prisma.dish.create({ data: { name: 'Món thử ô tìm nguyên liệu', price: 45000, ingredients: { create: [{ ingredientId: ingredient.id, amount: 10 }, { ingredientId: milk.id, amount: 100 }] } } });
      await page.goto(origin + `/admin/dishes/${dish.id}/edit`);
      const pickers = page.locator('[data-recipe-key="ingredientId"]');
      await pickers.first().waitFor();
      const docs = documents.length;
      assert.match(await pickers.nth(0).inputValue(), /Bột matcha/);
      assert.match(await pickers.nth(1).inputValue(), /Sữa tươi/);
      await pickers.nth(0).click();
      let list = page.locator('#' + await pickers.nth(0).getAttribute('aria-controls'));
      assert.ok(await list.getByRole('option').count() >= 3);
      await pickers.nth(0).fill('dUoNg NAu');
      assert.equal(await list.getByRole('option').count(), 1);
      assert.match(await list.getByRole('option').innerText(), /Đường nâu tìm kiếm/);
      await pickers.nth(0).press('ArrowDown');
      await pickers.nth(0).press('Enter');
      assert.equal(await pickers.nth(0).getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('[data-recipe-row]').nth(0).locator('input[type="hidden"]').inputValue(), String(sugar.id));
      await pickers.nth(1).fill('khong-co-nguyen-lieu-nay');
      list = page.locator('#' + await pickers.nth(1).getAttribute('aria-controls'));
      assert.equal(await list.getByRole('option').count(), 0);
      assert.match(await list.innerText(), /Không tìm thấy kết quả/);
      const writes = network.filter((req) => req.method === 'PATCH').length;
      await page.locator('button[type="submit"]').click();
      assert.equal(network.filter((req) => req.method === 'PATCH').length, writes);
      assert.equal(await pickers.nth(1).getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('[data-recipe-row]').nth(1).locator('input[type="hidden"]').inputValue(), '');
      await pickers.nth(1).fill('SUA TUOI');
      assert.equal(await list.getByRole('option').count(), 1);
      await list.getByRole('option').click();
      await pickers.nth(1).click();
      await pickers.nth(1).press('Escape');
      assert.equal(await pickers.nth(1).getAttribute('aria-expanded'), 'false');
      const savedResponse = page.waitForResponse((res) => res.url() === app.apiUrl + '/api/dishes/' + dish.id && res.request().method() === 'PATCH');
      await page.locator('button[type="submit"]').click();
      const saved = (await (await savedResponse).json()).data;
      assert.deepEqual(saved.ingredients.map((row) => row.ingredientId).sort((a, b) => a - b), [sugar.id, milk.id].sort((a, b) => a - b));
      await page.waitForURL(origin + '/dishes/' + dish.id);
      await page.getByRole('link', { name: 'Chỉnh sửa món', exact: true }).click();
      await pickers.first().waitFor();
      assert.match(await pickers.first().inputValue(), /Đường nâu/);
      assert.equal(documents.length, docs);
      await page.setViewportSize({ width: 390, height: 844 });
      await pickers.first().fill('duong');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(output, 'inventory-search-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1050 });
      await app.prisma.dish.delete({ where: { id: dish.id } });
    });
    await check('Chef dish dropdown toggles and loads available dishes as cards with Thêm món buttons', async () => {
      const coffee = await app.prisma.dish.create({ data: { name: 'Cà phê sữa tìm kiếm', price: 30000 } });
      const tea = await app.prisma.dish.create({ data: { name: 'Trà đào tìm kiếm', price: 35000 } });
      await page.goto(origin + `/admin/chefs/${chef.id}`);
      const toggle = page.locator('.dropdown-toggle-heading');
      await toggle.waitFor();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      const docs = documents.length;
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      const coffeeCard = page.locator('.available-dish').filter({ hasText: coffee.name });
      await coffeeCard.waitFor();
      assert.ok(await coffeeCard.getByRole('button', { name: 'Thêm món' }).count() > 0);
      await page.screenshot({ path: path.join(output, 'chef-dish-dropdown.png'), fullPage: true });
      await coffeeCard.getByRole('button', { name: 'Thêm món' }).click();
      await page.locator('.assigned-dish').filter({ hasText: coffee.name }).waitFor();
      assert.ok(await app.prisma.chefDish.findUnique({ where: { chefId_dishId: { chefId: chef.id, dishId: coffee.id } } }));
      assert.equal(await page.locator('.available-dish').filter({ hasText: coffee.name }).count(), 0);
      assert.equal(documents.length, docs);
      await app.prisma.dish.deleteMany({ where: { id: { in: [coffee.id, tea.id] } } });
    });
    await check('Dish form creates inline inventory and recipe; amount edits and confirmed unlink recalculate servings', async () => {
      await page.goto(origin + '/admin/dishes/new');
      await page.locator('#name').fill('Món có công thức trực tiếp');
      await page.locator('#price').fill('39000');
      const docs = documents.length;
      await page.getByRole('button', { name: '+ Thêm dòng nguyên liệu', exact: true }).click();
      const rows = page.locator('[data-recipe-row]');
      await chooseSearchOption(rows.nth(0).locator('[data-recipe-key="ingredientId"]'), ingredient.id);
      await rows.nth(0).locator('[data-recipe-key="amount"]').fill('10');
      await page.getByRole('button', { name: '+ Thêm dòng nguyên liệu', exact: true }).click();
      await rows.nth(1).getByLabel('Nguồn nguyên liệu 2', { exact: true }).selectOption('new');
      await rows.nth(1).locator('[data-recipe-key="name"]').fill('Sữa tạo trong form món');
      await rows.nth(1).locator('[data-recipe-key="unit"]').fill('ml');
      await rows.nth(1).locator('[data-recipe-key="stock"]').fill('1000');
      await rows.nth(1).locator('[data-recipe-key="amount"]').fill('200');
      await page.screenshot({ path: path.join(output, 'recipe-form-desktop.png'), fullPage: true });
      const response = page.waitForResponse((res) => res.url() === app.apiUrl + '/api/dishes' && res.request().method() === 'POST');
      await page.locator('button[type="submit"]').click();
      const dish = (await (await response).json()).data;
      const milk = dish.ingredients.find((line) => line.ingredient.name === 'Sữa tạo trong form món').ingredient;
      await page.waitForURL(origin + '/dishes/' + dish.id);
      await page.locator('.public-recipe').waitFor();
      assert.equal(dish.servings, 5);
      assert.match(await page.locator('.public-recipe').innerText(), /Sữa tạo trong form món/);
      await page.getByRole('link', { name: 'Công thức & nguyên liệu' }).click();
      await page.locator('[data-servings="5"]').waitFor();
      const milkRow = () => page.locator('.relation-table tbody tr').filter({ hasText: 'Sữa tạo trong form món' });
      await milkRow().getByRole('link', { name: 'Sửa lượng' }).click();
      await page.locator('#relation-amount').fill('0');
      await page.getByRole('button', { name: 'Lưu lượng nguyên liệu' }).click();
      assert.ok((await page.locator('#relation-amount-error').innerText()).length);
      await page.locator('#relation-amount').fill('400');
      await page.getByRole('button', { name: 'Lưu lượng nguyên liệu' }).click();
      await page.locator('[data-servings="2"]').waitFor();
      await page.getByRole('link', { name: '+ Thêm nguyên liệu', exact: true }).click();
      await page.getByRole('button', { name: '+ Thêm dòng nguyên liệu', exact: true }).click();
      await page.locator('[data-recipe-row]').getByLabel('Nguồn nguyên liệu 1', { exact: true }).selectOption('new');
      await page.locator('[data-recipe-key="name"]').fill('Đường thêm vào công thức');
      await page.locator('[data-recipe-key="unit"]').fill('g');
      await page.locator('[data-recipe-key="stock"]').fill('100');
      await page.locator('[data-recipe-key="amount"]').fill('10');
      await page.getByRole('button', { name: 'Thêm vào công thức' }).click();
      await page.locator('[data-servings="2"]').waitFor();
      assert.equal(await page.locator('.relation-table tbody tr').count(), 3);
      const deletions = network.filter((req) => req.method === 'DELETE').length;
      await milkRow().getByRole('link', { name: 'Gỡ', exact: true }).click();
      await page.getByRole('link', { name: 'Hủy, giữ liên kết' }).click();
      await page.locator('.relation-table').waitFor();
      assert.equal(network.filter((req) => req.method === 'DELETE').length, deletions);
      await milkRow().getByRole('link', { name: 'Gỡ', exact: true }).click();
      await page.getByRole('button', { name: 'Xác nhận gỡ', exact: true }).click();
      await page.locator('[data-servings="10"]').waitFor();
      assert.ok(await app.prisma.ingredient.findUnique({ where: { id: milk.id } }));
      await page.screenshot({ path: path.join(output, 'recipe-detail-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(output, 'recipe-detail-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1050 });
      await page.getByRole('link', { name: 'Sửa món & công thức' }).click();
      await page.locator('[data-recipe-row]').first().waitFor();
      await page.getByRole('button', { name: 'Bỏ dòng nguyên liệu 2', exact: true }).click();
      await page.locator('[data-recipe-key="amount"]').fill('25');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(origin + '/dishes/' + dish.id);
      await page.locator('.public-recipe').waitFor();
      assert.equal((await app.call('/api/dishes/' + dish.id)).body.data.servings, 20);
      assert.equal(documents.length, docs);
      await app.call('/api/dishes/' + dish.id, { method: 'DELETE' });
    });
    await check('Recipe field errors from real API preserve typed dish and ingredient values', async () => {
      await page.goto(origin + '/admin/dishes/new');
      await page.locator('#name').fill('Giữ tên khi công thức sai');
      await page.locator('#price').fill('50000');
      await page.getByRole('button', { name: '+ Thêm dòng nguyên liệu', exact: true }).click();
      await chooseSearchOption(page.locator('[data-recipe-key="ingredientId"]'), ingredient.id);
      await page.locator('[data-recipe-key="amount"]').fill('12');
      await page.route(app.apiUrl + '/api/dishes', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const data = route.request().postDataJSON();
        data.ingredients[0].amount = 0;
        const response = await route.fetch({ postData: JSON.stringify(data) });
        await route.fulfill({ response });
      });
      await page.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('[data-error-for="ingredients.0.amount"]')?.textContent.length > 0);
      assert.equal(await page.locator('#name').inputValue(), 'Giữ tên khi công thức sai');
      assert.equal(await page.locator('[data-recipe-key="amount"]').inputValue(), '12');
      assert.match(await page.locator('[data-recipe-key="ingredientId"]').inputValue(), /Bột matcha/);
      await page.unroute(app.apiUrl + '/api/dishes');
    });
    await check('Chef detail assigns and confirms unlink without deleting dish or reloading document', async () => {
      const dish = await app.prisma.dish.create({ data: { name: 'Món thử gán đầu bếp', price: 40000 } });
      await page.goto(origin + `/admin/chefs/${chef.id}`);
      const toggle = page.locator('.dropdown-toggle-heading');
      await toggle.waitFor();
      const docs = documents.length;
      await toggle.click();
      const card = page.locator('.available-dish').filter({ hasText: dish.name });
      await card.waitFor();
      await card.getByRole('button', { name: 'Thêm món' }).click();
      await page.locator('.assigned-dish').filter({ hasText: dish.name }).waitFor();
      await page.screenshot({ path: path.join(output, 'chef-assignments.png'), fullPage: true });
      await page.locator('.assigned-dish').filter({ hasText: dish.name }).getByRole('link', { name: 'Gỡ món', exact: true }).click();
      await page.getByRole('link', { name: 'Hủy, giữ liên kết' }).click();
      await page.locator('.assigned-dish').filter({ hasText: dish.name }).waitFor();
      await page.locator('.assigned-dish').filter({ hasText: dish.name }).getByRole('link', { name: 'Gỡ món', exact: true }).click();
      await page.getByRole('button', { name: 'Xác nhận gỡ', exact: true }).click();
      await ready();
      assert.equal(await page.locator('.assigned-dish').filter({ hasText: dish.name }).count(), 0);
      assert.ok(await app.prisma.dish.findUnique({ where: { id: dish.id } }));
      assert.equal(documents.length, docs);
      await app.prisma.dish.delete({ where: { id: dish.id } });
    });
    await check('Self-hosted Kodchasan renders Vietnamese glyphs in headers, form and recipe labels', async () => {
      await page.goto(origin + '/admin/dishes/new');
      await page.locator('#name').waitFor();
      await page.evaluate(async () => {
        const probe = document.createElement('div');
        probe.id = 'font-probe';
        probe.textContent = 'Đầu bếp Nguyên liệu Sữa tươi Ắ Ằ Ẳ Ẵ Ặ Ế Ề Ể Ễ Ệ Ố Ồ Ổ Ỗ Ộ Ơ Ư Ứ Ừ Ử Ữ Ự';
        document.querySelector('main').append(probe);
        await document.fonts.ready;
      });
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      const documentNode = await cdp.send('DOM.getDocument');
      const probe = await cdp.send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '#font-probe' });
      const rendered = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: probe.nodeId });
      assert.ok(rendered.fonts.some((font) => font.familyName === 'Kodchasan' && font.isCustomFont));
      assert.equal(rendered.fonts.filter((font) => font.familyName !== 'Kodchasan').length, 0);
      for (const selector of ['h1', 'input', 'label']) assert.match(await page.locator(selector).first().evaluate((node) => getComputedStyle(node).fontFamily), /Kodchasan/);
      await page.locator('#font-probe').evaluate((node) => node.remove());
    });
    await check('Actual API VALIDATION_FAILED displays beside field and keeps typed values', async () => {
      await page.goto(origin + '/admin/dishes/new');
      await page.locator('#name').fill('Giữ nguyên tên này');
      await page.locator('#price').fill('12345');
      await page.route(app.apiUrl + '/api/dishes', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const data = route.request().postDataJSON();
        const response = await route.fetch({ postData: JSON.stringify({ ...data, price: -1 }) });
        await route.fulfill({ response });
      });
      await page.locator('button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector('#price-error')?.textContent.length > 0);
      assert.equal(await page.locator('#name').inputValue(), 'Giữ nguyên tên này');
      assert.equal(await page.locator('#price').inputValue(), '12345');
      assert.match(page.url(), /\/new$/);
      await page.unroute(app.apiUrl + '/api/dishes');
    });
    await check('Pending submit is disabled and repeated submit creates one request only', async () => {
      await page.goto(origin + '/admin/chefs/new');
      await page.locator('#name').fill('Chống gửi trùng');
      await page.locator('#specialty').fill('Matcha');
      let writes = 0;
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      await page.route(app.apiUrl + '/api/chefs', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        writes++;
        await gate;
        await route.continue();
      });
      await page.locator('button[type="submit"]').click();
      assert.equal(await page.locator('button[type="submit"]').isDisabled(), true);
      await page.locator('form.record-form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      release();
      await page.waitForURL(origin + '/admin/chefs');
      await ready();
      assert.equal(writes, 1);
      await page.unroute(app.apiUrl + '/api/chefs');
    });
    await check('Loading state and stale response protection during fast navigation', async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      await page.route(app.apiUrl + '/api/dishes/1', async (route) => {
        await gate;
        try { await route.continue(); } catch { /* Navigation aborted this request. */ }
      });
      await page.goto(origin + '/dishes/1');
      await page.locator('[data-state="loading"]').waitFor();
      await page.getByRole('link', { name: 'Quản trị', exact: true }).click();
      await page.locator('.admin-row').first().waitFor();
      release();
      await page.unroute(app.apiUrl + '/api/dishes/1');
      assert.match(page.url(), /\/admin\/dishes$/);
      assert.equal(await page.locator('.dish-detail').count(), 0);
    });
    await check('NOT_FOUND differs from network, HTTP and malformed response errors; retry works', async () => {
      for (const route of ['/dishes/99999', '/dishes/abc', '/admin/chefs/99999/edit', '/admin/ingredients/99999/delete', '/abc']) {
        await page.goto(origin + route);
        await page.locator('[data-state="notFound"]').waitFor();
      }
      for (const failure of ['network', 'http', 'json', 'shape']) {
        await page.route(app.apiUrl + '/api/dishes/paged?**', (route) => failure === 'network' ? route.abort('connectionrefused') : route.fulfill({
          status: failure === 'http' ? 404 : 200, contentType: 'application/json',
          body: failure === 'json' ? 'bad JSON' : failure === 'shape' ? JSON.stringify({ ok: true, data: null }) : '{}'
        }));
        await page.goto(origin + '/dishes');
        await page.locator('[data-state="error"]').waitFor();
        assert.equal(await page.locator('[data-state="notFound"]').count(), 0);
        await page.unroute(app.apiUrl + '/api/dishes/paged?**');
        await page.getByRole('button', { name: 'Thử lại' }).click();
        await page.locator('.dish-card').first().waitFor();
      }
    });
    await check('API content is escaped rather than inserted as HTML', async () => {
      const payload = '<img src=x onerror=window.__xss=true>';
      const result = await app.call('/api/dishes', { method: 'POST', data: { name: payload, description: '<script>window.__xss=true</script>', price: 0 } });
      await page.goto(origin + '/dishes/' + result.body.data.id);
      await page.locator('.dish-detail').waitFor();
      assert.equal(await page.locator('h1').innerText(), payload);
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      assert.equal(await page.locator('main script').count(), 0);
      await app.call('/api/dishes/' + result.body.data.id, { method: 'DELETE' });
    });
    await check('Mobile menu / form / admin fit viewport without horizontal overflow', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ['/dishes', '/admin/ingredients', '/admin/dishes/new']) {
        await page.goto(origin + route);
        await ready();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, route);
        await page.screenshot({ path: path.join(output, route === '/dishes' ? 'menu-mobile.png' : route.endsWith('/new') ? 'form-mobile.png' : 'admin-mobile.png'), fullPage: true });
      }
      await page.setViewportSize({ width: 1440, height: 1050 });
      await page.goto(origin + '/admin/dishes');
      await ready();
      await page.screenshot({ path: path.join(output, 'admin-desktop.png'), fullPage: true });
    });
    await check('Real browser sends CORS preflights before PATCH and DELETE; no uncaught JS errors', async () => {
      for (const method of ['PATCH', 'DELETE']) {
        const index = network.findIndex((req) => req.method === method);
        assert.ok(index >= 0, method);
        assert.ok(network.slice(0, index).some((req) => req.method === 'OPTIONS' && req.url === network[index].url), 'OPTIONS before ' + method);
      }
      assert.deepEqual(errors, []);
    });
    await check('Shutting down the real API displays a technical error while SPA remains usable', async () => {
      await app.stopApi();
      await page.goto(origin + '/dishes');
      await page.locator('[data-state="error"]').waitFor();
      assert.ok((await page.locator('main').innerText()).includes('Không kết nối được máy chủ'));
      assert.equal(await page.locator('[data-state="notFound"]').count(), 0);
      assert.deepEqual(errors, []);
    });
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ results, network, errors }, null, 2));
    console.log(`${results.length} browser checks passed. Evidence: tests/results/`);
  } finally {
    await browser?.close();
    await app.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
