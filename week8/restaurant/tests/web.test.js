const assert = require('node:assert/strict');
const { test } = require('node:test');

test('SPA server falls back to index.html and serves axios from one file', async () => {
  const { createWebServer } = await import('../web/server.js');
  const server = createWebServer().listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const deep = await fetch(`${base}/admin/dishes/1/edit`);
    assert.equal(deep.status, 200);
    assert.match(deep.headers.get('content-type'), /html/);
    assert.match(await deep.text(), /id="app"/);
    const home = await fetch(`${base}/dishes?q=matcha`);
    assert.match(await home.text(), /src="\/main.js"/);
    const config = await fetch(`${base}/config.js`);
    assert.match(await config.text(), /http:\/\/localhost:3001/);
    const client = await fetch(`${base}/vendor/axios.min.js`);
    assert.equal(client.status, 200);
    assert.match(await client.text(), /axios/);
    const css = await fetch(`${base}/style.css`);
    assert.equal(css.status, 200);
    assert.equal((await fetch(`${base}/missing-file.js`)).status, 404);
    const secret = await fetch(`${base}/%2e%2e/%2e%2e/package.json`);
    const secretText = await secret.text();
    assert.doesNotMatch(secretText, /soucha-restaurant/);
    assert.doesNotMatch(secretText, /DATABASE_URL/);
    assert.equal((await fetch(`${base}/api/dishes`, { method: 'POST' })).status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
