const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createPrisma } = require('../api/src/database');
const { createApp } = require('../api/src/app');

async function fixture() {
  const tmp = path.join(__dirname, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const folder = fs.mkdtempSync(path.join(tmp, 'run-'));
  const databaseUrl = 'file:' + path.join(folder, 'test.db').replaceAll('\\', '/');
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.sqlite.prisma'], {
    cwd: path.join(__dirname, '../api'), env: { ...process.env, DATABASE_URL: databaseUrl, RUST_LOG: 'info' }, encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error('Test database setup failed: ' + result.stderr);
  const prisma = createPrisma({ url: databaseUrl });
  const logs = [];
  let spaOrigin = 'http://localhost:5173';
  const app = createApp({ prisma, provider: 'sqlite', spaOrigin, logger: { error: (...args) => logs.push(args) } });
  const server = app.listen(0);
  await once(server, 'listening');
  const apiUrl = 'http://localhost:' + server.address().port;
  let webServer;
  return {
    prisma, apiUrl, logs, folder,
    async stopApi() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
    async startWeb() {
      const { createWebServer } = await import('../web/server.js');
      // Reserve a stable test origin, then build a fresh API with its allowlist.
      webServer = createWebServer({ apiBaseUrl: apiUrl + '/api' });
      webServer.listen(0);
      await once(webServer, 'listening');
      spaOrigin = 'http://localhost:' + webServer.address().port;
      const browserApi = createApp({ prisma, provider: 'sqlite', spaOrigin, logger: { error: (...args) => logs.push(args) } });
      server.removeAllListeners('request');
      server.on('request', browserApi);
      return spaOrigin;
    },
    async call(url, { method = 'GET', data, headers = {}, body } = {}) {
      const response = await fetch(apiUrl + url, {
        method, headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: data === undefined ? body : JSON.stringify(data)
      });
      return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
    },
    async close() {
      for (const instance of [webServer, server].filter((item) => item?.listening)) {
        instance.closeAllConnections();
        await new Promise((resolve) => instance.close(resolve));
      }
      await prisma.$disconnect();
      // Keep the isolated files in ignored tests/.tmp for diagnosis; never touch the demo DB.
    }
  };
}
module.exports = { fixture };
