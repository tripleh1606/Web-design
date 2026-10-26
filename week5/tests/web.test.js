const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('SPA server supports every deep link, reload, assets and public-only API config', async () => {
  const { createWebServer } = await import('../web/server.js');
  const server = createWebServer({ apiBaseUrl: 'http://localhost:3999/api' });
  server.listen(0);
  await once(server, 'listening');
  try {
    const origin = 'http://localhost:' + server.address().port;
    const routes = ['/dishes', '/dishes/1', '/abc'];
    for (const resource of ['dishes', 'chefs', 'ingredients']) routes.push(`/admin/${resource}`, `/admin/${resource}/new`, `/admin/${resource}/1/edit`, `/admin/${resource}/1/delete`);
    for (const route of routes) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 200, route);
      assert.match(await response.text(), /<script type="module" src="\/src\/app.js">/);
    }
    assert.match(await (await fetch(origin + '/config.js')).text(), /3999\/api/);
    assert.equal((await fetch(origin + '/config.js')).headers.get('cache-control'), 'no-store');
    assert.match((await fetch(origin + '/beverages/matcha-latte.jpeg')).headers.get('cache-control'), /max-age=86400/);
    for (const route of ['/src/app.js', '/style.css', '/logo.svg', '/beverages/matcha-latte.jpeg']) assert.equal((await fetch(origin + route)).status, 200);
    for (const route of ['/missing.js', '/api/dishes', '/.env', '/src/missing.js']) assert.equal((await fetch(origin + route)).status, 404, route);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
