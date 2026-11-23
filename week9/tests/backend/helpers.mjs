import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { createRepository } from '../../api/src/database/repository.js';
import { createStorageLifecycle } from '../../api/src/storage/lifecycle.js';
import { createPublicationService } from '../../api/src/services/publication.js';
import { createApp } from '../../api/src/app.js';

const weekRoot = fileURLToPath(new URL('../../', import.meta.url));
const baseDir = mkdtempSync(join(tmpdir(), 'gallery-baseline-'));
const baseline = join(baseDir, 'baseline.sqlite');
// Run the actual Prisma migration once, then clone the empty migrated DB.
execFileSync(process.execPath, [join(weekRoot, 'scripts/database.mjs'), 'deploy'], {
  cwd: weekRoot, env: { ...process.env, DATABASE_URL: `file:${baseline.replaceAll('\\', '/')}` }, stdio: 'pipe',
});
process.on('exit', () => rmSync(baseDir, { recursive: true, force: true }));

export const sourcePhoto = { title: 'Buổi chiều', alt: 'Mây phía trên ngọn đồi', width: 320, height: 200 };
export const sampleVariants = [{ width: 320, height: 200, bytes: 3, mime: 'image/webp', path: 'server-produced.webp' }];

export async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'gallery-backend-'));
  const filename = join(directory, 'gallery.sqlite');
  copyFileSync(baseline, filename);
  let repository = await createRepository(filename);
  const objects = new Map();
  const storage = {
    async put(key, variant) { objects.set(key, { body: Buffer.from('abc'), length: variant.bytes, contentType: variant.mime, etag: '"test-etag"' }); },
    async get(key) {
      const object = objects.get(key);
      if (!object) throw new Error('Storage object not found');
      return { ...object, body: Readable.from([object.body]) };
    },
    async delete(key) { objects.delete(key); },
  };
  let lifecycle = createStorageLifecycle({ repository, storage });
  let publishPhoto = createPublicationService({ lifecycle });
  let server;
  let address;
  const config = { capability: randomBytes(32).toString('base64url'), publicOrigin: 'http://gallery.test', secureCookie: false, sessionTtlSeconds: 3600, ...options };
  async function stopServer() {
    if (!server) return;
    await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    server = null;
  }
  async function startServer() {
    server = createApp({ repository, storage, lifecycle, config, uploadHandler: options.uploadHandler }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    address = `http://127.0.0.1:${server.address().port}`;
  }
  await startServer();
  t.after(async () => { await stopServer(); await repository.close(); rmSync(directory, { recursive: true, force: true }); });
  return {
    config, objects, storage, filename,
    get repository() { return repository; }, get lifecycle() { return lifecycle; },
    publish: (...args) => publishPhoto(...args),
    request: (path, init = {}) => fetch(`${address}${path}`, init),
    async login() {
      const response = await fetch(`${address}/api/manage/session`, { method: 'POST', headers: { Origin: config.publicOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ capability: config.capability }) });
      if (response.status !== 204) throw new Error(`Login failed: ${response.status}`);
      return { cookie: response.headers.get('set-cookie').split(';')[0], header: response.headers.get('set-cookie') };
    },
    sql(fn) { const db = new DatabaseSync(filename); try { return fn(db); } finally { db.close(); } },
    async restart() {
      await stopServer(); await repository.close();
      repository = await createRepository(filename);
      lifecycle = createStorageLifecycle({ repository, storage });
      publishPhoto = createPublicationService({ lifecycle });
      await startServer();
    },
  };
}
