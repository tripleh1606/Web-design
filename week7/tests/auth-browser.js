const assert = require('node:assert/strict');
const { test } = require('node:test');
const { chromium } = require('playwright');
const { fixture } = require('./helpers');

test('Week 7 SPA account forms use a new v2 challenge and keep navigation in the browser', async (t) => {
  let otp, resetUrl;
  const seen = new Set();
  const captcha = {
    siteKey: 'browser-test-key',
    isConfigured: () => true,
    verify(token) {
      if (typeof token !== 'string' || !token.startsWith('browser-proof-') || seen.has(token)) {
        return { ok: false, reason: 'invalid' };
      }
      seen.add(token);
      return { ok: true };
    }
  };
  const app = await fixture({ auth: {
    recaptchaVerifier: captcha,
    mailer: {
      isConfigured: () => true,
      sendActivationOtp(message) { otp = message.otp; },
      sendPasswordResetEmail(message) { resetUrl = message.resetUrl; },
      sendPasswordChangedNotice() {}
    }
  } });
  t.after(() => app.close());
  const origin = await app.startWeb();
  const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ?
    { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://www.google.com/recaptcha/api.js?*', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `
      window.grecaptcha = {
        render(node, options) {
          const control = document.createElement('button');
          control.type = 'button';
          control.textContent = 'Checkbox test';
          control.onclick = () => options.callback('browser-proof-' + crypto.randomUUID());
          node.append(control);
          return 0;
        },
        reset() {}
      };
      window.souchaRecaptchaReady();
    `
  }));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const link = (name) => page.getByRole('link', { name, exact: true });
  const heading = (name) => page.getByRole('heading', { name, exact: true }).waitFor();
  const email = 'browser@example.com';
  const password = 'browser-password';
  const fillLogin = async (value) => {
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(value);
  };
  const waitFor = async (predicate) => {
    for (let i = 0; i < 50 && !predicate(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(predicate());
  };

  await page.goto(origin + '/admin/dishes');
  await heading('Đăng nhập');
  assert.equal(new URL(page.url()).pathname, '/login');
  await link('Tạo tài khoản').click();
  await heading('Đăng ký');
  await fillLogin(password);
  await page.locator('#confirmPassword').fill(password);
  await button('Đăng ký').click();
  await page.getByText('Vui lòng hoàn thành reCAPTCHA.', { exact: true }).waitFor();
  await button('Checkbox test').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await button('Đăng ký').click();
  await heading('Kích hoạt tài khoản');
  await waitFor(() => otp);
  await page.locator('#otp').fill(otp);
  await button('Xác minh OTP').click();
  await heading('Đăng nhập');
  for (let i = 0; i < 3; i++) {
    await fillLogin('incorrect-password');
    await button('Đăng nhập').click();
    await page.getByText('Email hoặc mật khẩu không đúng.', { exact: true }).waitFor();
  }
  await button('Checkbox test').click();
  await fillLogin(password);
  const loginResponse = page.waitForResponse((response) => response.url() === app.apiUrl + '/api/auth/login' && response.status() === 200);
  await button('Đăng nhập').click();
  await page.waitForURL(origin + '/admin/dishes');
  const { accessToken } = (await (await loginResponse).json()).data;
  const headers = { Authorization: 'Bearer ' + accessToken };
  const dishesApi = app.apiUrl + '/api/dishes';
  const xss = '<img src=x onerror="window.injected=true">';
  assert.equal((await page.request.post(dishesApi, { headers, data: { name: xss, price: 100 } })).ok(), true);
  await link('Quản trị').click();
  await page.getByText(xss, { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await page.locator('main img[src="x"]').count(), 0);
  await link('Đăng xuất').click();
  await heading('Đăng xuất');
  assert.equal(await page.locator('.auth-captcha').count(), 0);
  await button('Đăng xuất').click();
  await heading('Đăng nhập');
  assert.equal((await page.request.get(dishesApi)).status(), 401);
  assert.equal((await page.request.get(dishesApi, { headers })).status(), 200);
  await link('Quên mật khẩu?').click();
  await page.locator('#email').fill(email);
  await button('Gửi liên kết').click();
  await waitFor(() => resetUrl);
  await page.goto(resetUrl);
  await heading('Đặt lại mật khẩu');
  await page.locator('#password').fill(password + '-updated');
  await page.locator('#confirmPassword').fill(password + '-updated');
  await button('Lưu mật khẩu mới').click();
  await heading('Đăng nhập');
  await fillLogin(password + '-updated');
  await button('Đăng nhập').click();
  await page.waitForURL(origin + '/admin/dishes');
  await page.reload();
  await heading('Đăng nhập');
  assert.equal(seen.size, 2);
  assert.deepEqual(errors, []);
});
