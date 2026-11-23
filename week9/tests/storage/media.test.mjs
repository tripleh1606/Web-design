import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { createMediaHandler } from '../../api/src/media/stream.js';

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
