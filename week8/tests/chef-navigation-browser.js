const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixture } = require('./helpers');
const { createAccessTokens } = require('../api/src/auth/access-token');

test('chef sees the full menu and manages only their own cooking list', async t => {
  const secret = randomBytes(32).toString('base64url');
  const app = await fixture({ auth: { jwtSecret: secret } });
  t.after(() => app.close());
  const chef = await app.prisma.chef.create({ data: { name: 'Chef navigation', specialty: 'Tea' } });
  const otherChef = await app.prisma.chef.create({ data: { name: 'Other chef', specialty: 'Tea' } });
  const dish = await app.prisma.dish.create({ data: {
    name: 'Assigned tea', price: 100, chefs: { create: { chefId: chef.id } },
    ingredients: { create: { amount: 2, ingredient: { create: { name: 'Tea leaves', unit: 'g', stock: 100 } } } }
  } });
  const extraDish = await app.prisma.dish.create({ data: { name: 'Trà đào mới', price: 200 } });
  const origin = await app.startWeb();
  const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ?
    { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const issuer = createAccessTokens(secret);
  async function signIn(role, chefId = null) {
    const user = await app.prisma.user.create({ data: {
      email: `${role}-${chefId || 'none'}@example.test`, passwordHash: 'unused', status: 'active', emailVerifiedAt: new Date(), role, chefId
    } });
    await page.goto(origin + '/login');
    await page.locator('[data-navigation-ready="true"]').waitFor();
    await page.evaluate(token => sessionStorage.setItem('soucha-access-token', token), issuer.issue(user.id));
    await page.goto(origin + '/dishes');
    await page.locator('[data-navigation-ready="true"]').waitFor();
    return user;
  }
  const heading = async name => {
    try { await page.getByRole('heading', { name, exact: true }).waitFor(); }
    catch (error) { throw new Error(`${error.message}\n${await page.locator('main').innerText()}\n${JSON.stringify(errors)}\n${JSON.stringify(app.logs)}`); }
  };
  async function noManagementControls() {
    assert.equal(await page.locator('main a[href$="/edit"], main a[href$="/delete"], main a[href$="/new"]').count(), 0);
  }

  await signIn('chef', chef.id);
  await page.locator('.site-header nav').getByRole('link', { name: 'Đầu bếp', exact: true }).click();
  await heading('Món tôi có thể chế biến');
  assert.equal(new URL(page.url()).pathname, `/admin/chefs/${chef.id}`);
  assert.equal(await page.getByRole('link', { name: otherChef.name, exact: true }).count(), 0);
  await page.getByRole('button', { name: '+ Thêm món có thể chế biến', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Tìm món trong thực đơn', exact: true });
  await search.fill('no matching dish');
  await page.getByText('Không tìm thấy món phù hợp chưa có trong danh sách của bạn.', { exact: true }).waitFor();
  await search.fill('tra dao');
  assert.equal(await page.locator('.available-dish').count(), 1);
  await page.setViewportSize({ width: 375, height: 850 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, 'results/chef-cooking-list.png'), fullPage: true });
  const availableDish = page.locator('.available-dish').filter({ hasText: extraDish.name });
  await availableDish.getByRole('button', { name: 'Thêm món', exact: true }).click();
  const assignedDish = page.locator('.assigned-dish').filter({ hasText: extraDish.name });
  await assignedDish.getByRole('link', { name: 'Gỡ khỏi danh sách', exact: true }).waitFor();
  assert.equal(await page.locator('.available-dish').filter({ hasText: extraDish.name }).count(), 0);
  assert.equal(await app.prisma.chefDish.count({ where: { chefId: chef.id, dishId: extraDish.id } }), 1);
  await page.reload();
  await heading('Món tôi có thể chế biến');
  await assignedDish.getByRole('link', { name: 'Gỡ khỏi danh sách', exact: true }).click();
  await page.getByRole('link', { name: 'Hủy, giữ liên kết', exact: true }).click();
  await heading('Món tôi có thể chế biến');
  assert.equal(await app.prisma.chefDish.count({ where: { chefId: chef.id, dishId: extraDish.id } }), 1);
  await assignedDish.getByRole('link', { name: 'Gỡ khỏi danh sách', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận gỡ', exact: true }).click();
  await heading('Món tôi có thể chế biến');
  assert.equal(await app.prisma.chefDish.count({ where: { chefId: chef.id, dishId: extraDish.id } }), 0);
  assert.ok(await app.prisma.dish.findUnique({ where: { id: extraDish.id } }));
  await page.getByRole('link', { name: dish.name, exact: true }).click();
  await heading(dish.name);
  await noManagementControls();
  assert.equal(await page.getByRole('columnheader', { name: 'Thao tác', exact: true }).count(), 0);
  assert.equal(await page.locator('[data-servings="50"]').count(), 1);
  await page.goto(origin + `/dishes/${dish.id}`);
  await heading(dish.name);
  await page.getByRole('button', { name: 'Đánh dấu tạm hết', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Công thức & nguyên liệu', exact: true }).click();
  await heading(dish.name);
  await page.locator('.admin-tabs').getByRole('link', { name: 'Nguyên liệu', exact: true }).click();
  await heading('Nguyên liệu');
  await noManagementControls();
  await page.goto(origin + `/dishes/${extraDish.id}`);
  await heading(extraDish.name);
  assert.equal(await page.getByRole('button', { name: 'Đánh dấu tạm hết', exact: true }).count(), 0);
  for (const path of [`/admin/chefs/${chef.id}/edit`, '/admin/dishes/new', `/admin/dishes/${dish.id}/ingredients/new`, `/admin/chefs/${otherChef.id}/dishes/${dish.id}/delete`, '/admin/users']) {
    await page.goto(origin + path);
    await heading('Không có quyền truy cập');
  }

  const unlinked = await signIn('chef');
  await page.getByRole('link', { name: extraDish.name, exact: true }).waitFor();
  await page.goto(origin + '/admin/chefs');
  await heading('Chưa liên kết hồ sơ đầu bếp');
  assert.equal(await page.getByRole('button', { name: '+ Thêm món có thể chế biến', exact: true }).count(), 0);
  await noManagementControls();
  await signIn('admin');
  await page.goto(origin + '/admin/authorization');
  await page.locator('#authorization-email').fill(unlinked.email);
  await page.getByRole('button', { name: 'Tìm tài khoản', exact: true }).click();
  await heading(unlinked.email);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Lưu vai trò', exact: true }).click();
  await page.getByText('Đã cập nhật vai trò và liên kết hồ sơ đầu bếp.', { exact: true }).waitFor();
  const repaired = await app.prisma.user.findUnique({ where: { id: unlinked.id } });
  assert.ok(repaired.chefId);
  await page.evaluate(token => sessionStorage.setItem('soucha-access-token', token), issuer.issue(unlinked.id));
  await page.goto(origin + '/admin/chefs');
  await heading('Món tôi có thể chế biến');
  assert.equal(new URL(page.url()).pathname, `/admin/chefs/${repaired.chefId}`);
  await page.getByText('Chưa có món nào.', { exact: false }).waitFor();
  await page.getByRole('button', { name: '+ Thêm món có thể chế biến', exact: true }).waitFor();

  for (const role of ['customer', 'staff']) {
    await signIn(role);
    assert.equal(await page.locator('.site-header nav a[href^="/admin"]:visible').count(), 0);
    await page.goto(origin + '/admin/chefs');
    await heading('Không có quyền truy cập');
  }
  await signIn('manager');
  await page.locator('.site-header nav').getByRole('link', { name: 'Quản trị', exact: true }).click();
  await heading('Món ăn');
  await page.getByRole('link', { name: '+ Thêm món ăn', exact: true }).waitFor();
  assert.deepEqual(errors, []);
});
