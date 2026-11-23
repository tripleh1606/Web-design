import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { createMediaHandler } from '../../api/src/media/stream.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteRepository } from '../../api/src/storage/sqlite-repository.js';
import { createStorageLifecycle } from '../../api/src/storage/lifecycle.js';

function response() {
  const chunks = [], headers = new Map();
  const res = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk); callback(); } });
  res.setHeader = (name, value) => headers.set(name.toLowerCase(), value);
  res.removeHeader = name => headers.delete(name.toLowerCase());
  res.status = code => { res.statusCode = code; return res; };
  res.headers = headers;
  res.chunks = chunks;
  return res;
}

test('unpublished media is not fetched or publicly cached', async () => {
  let fetched = false;
  const handler = createMediaHandler({ repository: { async withLock(fn) { return fn(); }, async findPublishedVariant() { return null; } }, storage: { async get() { fetched = true; } } });
  const res = response();
  await handler({ params: { id: 'missing', width: '320' } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(fetched, false);
});

test('published media streams with object headers', async () => {
  let locked = false;
  const repository = { async withLock(fn) { locked = true; try { return await fn(); } finally { locked = false; } }, async findPublishedVariant() { assert.equal(locked, true); return { key: 'server-key', bytes: 3, mime: 'image/webp' }; } };
  const storage = { async get(key) { assert.equal(key, 'server-key'); assert.equal(locked, true); return { body: Readable.from([Buffer.from('abc')]), length: 3, etag: '"etag"', contentType: 'image/webp' }; } };
  const res = response();
  await createMediaHandler({ repository, storage })({ params: { id: 'photo', width: '320' } }, res);
  assert.equal(Buffer.concat(res.chunks).toString(), 'abc');
  assert.equal(res.headers.get('content-length'), '3');
  assert.equal(res.headers.get('etag'), '"etag"');
  assert.equal(res.headers.get('content-type'), 'image/webp');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('deletion waits for object acquisition but not a stalled client', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-media-'));
  const repository = createSqliteRepository(join(dir, 'gallery.sqlite'));
  let releaseGet, getStarted;
  const started = new Promise(resolve => { getStarted = resolve; });
  const acquired = new Promise(resolve => { releaseGet = resolve; });
  const body = new Readable({ read() {} });
  const storage = {
    async get() {
      getStarted();
      await acquired;
      return { body, length: 3, etag: '"etag"', contentType: 'image/webp' };
    },
    async delete() {},
  };
  const lifecycle = createStorageLifecycle({ repository, storage });
  const res = response();
  let stream, deletion;
  try {
    await repository.withLock(async () => {
      repository.publishPhoto({ id: 'photo', title: 't', alt: 'a', width: 320, height: 200, variants: [{ width: 320, height: 200, bytes: 3, mime: 'image/webp', key: 'key' }] });
    });
    const handler = createMediaHandler({ repository, storage });
    stream = handler({ params: { id: 'photo', width: '320' } }, res);
    await started;
    let deleted = false;
    deletion = lifecycle.deletePhoto('photo').then(result => { deleted = true; return result; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(deleted, false);
    releaseGet();
    const result = await Promise.race([deletion, new Promise(resolve => setImmediate(() => resolve('blocked')))]);
    assert.deepEqual(result, { found: true, pending: false });
    assert.deepEqual(await Promise.race([
      lifecycle.recover(),
      new Promise(resolve => setImmediate(() => resolve('blocked'))),
    ]), []);
    const missing = response();
    await handler({ params: { id: 'photo', width: '320' } }, missing);
    assert.equal(missing.statusCode, 404);
    body.push('abc');
    body.push(null);
    await stream;
    assert.equal(Buffer.concat(res.chunks).toString(), 'abc');
  } finally {
    releaseGet();
    body.destroy();
    await Promise.allSettled([stream, deletion].filter(Boolean));
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
