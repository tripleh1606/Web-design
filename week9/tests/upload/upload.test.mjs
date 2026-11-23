import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createUploadRouter } from '../../api/src/routes/upload.js';

const require = createRequire(new URL('../../api/package.json', import.meta.url));
const express = require('express');
const sharp = require('sharp');
const makeImage = (width, height, type = 'jpeg') => sharp({ create: { width, height, channels: 3, background: '#ac45de' } })[type]().toBuffer();

async function server(run, publish = async () => 'photo-id') {
  const root = await mkdtemp(join(tmpdir(), 'upload-test-'));
  const app = express();
  app.use(createUploadRouter({ requireManager: (req, res, next) => req.headers.authorization === 'manager' ? next() : res.sendStatus(403), lifecycle: { publish }, stagingRoot: root }));
  const listener = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { await run(`http://127.0.0.1:${listener.address().port}/api/photos`, root); }
  finally { await new Promise(resolve => listener.close(resolve)); await rm(root, { recursive: true, force: true }); }
}
function body(files, metadata = files.map(() => ({ title: 'Title', alt: 'Description' }))) {
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  for (const file of files) form.append('photos', new Blob([file]), 'same.jpg');
  return form;
}
const send = (url, form, auth = true) => fetch(url, { method: 'POST', headers: auth ? { authorization: 'manager' } : {}, body: form });

test('mixed files preserve index, generate actual variants and clean staging', async () => {
  const source = await makeImage(800, 400);
  let calls = 0;
  await server(async (url, root) => {
    const response = await send(url, body([source, Buffer.from('fake'), source]));
    assert.equal(response.status, 200);
    const { results } = await response.json();
    assert.deepEqual(results.map(r => [r.index, r.ok]), [[0, true], [1, false], [2, true]]);
    assert.equal(results[1].error.code, 'INVALID_IMAGE');
    assert.deepEqual(await readdir(root), []);
  }, async (photo, variants) => {
    calls++;
    assert.deepEqual([photo.width, photo.height], [800, 400]);
    assert.deepEqual(variants.map(v => v.width), [320, 800]);
    for (const variant of variants) {
      const bytes = await readFile(variant.path);
      const meta = await sharp(bytes).metadata();
      assert.equal(bytes.length, variant.bytes);
      assert.equal(meta.format, 'webp');
      assert.equal(meta.width, variant.width);
      assert.equal(meta.exif, undefined);
    }
    return `id-${calls}`;
  });
  assert.equal(calls, 2);
});

test('invalid request and missing authorization never publish', async () => {
  const image = await makeImage(20, 20, 'png');
  let calls = 0;
  await server(async url => {
    assert.equal((await send(url, body([image]), false)).status, 403);
    assert.equal((await send(url, body([image], []))).status, 400);
    assert.equal((await send(url, body([]))).status, 400);
    assert.equal((await send(url, body(Array(6).fill(image)))).status, 400);
    assert.equal((await send(url, body(Array(5).fill(image)))).status, 200);
  }, async () => { calls++; return 'id'; });
  assert.equal(calls, 5);
});

test('truncated images and oversized files are independent file errors', async () => {
  const image = await makeImage(80, 40);
  await server(async url => {
    const response = await send(url, body([image.subarray(0, 50), Buffer.alloc(10 * 1024 * 1024 + 1), image]));
    const { results } = await response.json();
    assert.deepEqual(results.map(r => r.ok), [false, false, true]);
    assert.equal(results[1].error.code, 'FILE_TOO_LARGE');
  });
});

test('EXIF orientation is applied and metadata removed', async () => {
  const image = await sharp({ create: { width: 100, height: 200, channels: 3, background: 'red' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  await server(async url => { assert.equal((await send(url, body([image]))).status, 200); }, async (photo, variants) => {
    assert.deepEqual([photo.width, photo.height], [200, 100]);
    assert.deepEqual(variants.map(v => [v.width, v.height]), [[200, 100]]);
    const meta = await sharp(await readFile(variants[0].path)).metadata();
    assert.equal(meta.exif, undefined);
    return 'id';
  });
});

test('request over 55 MiB returns 413 and publishes nothing', async () => {
  let calls = 0;
  await server(async (url, root) => {
    const response = await send(url, body([Buffer.alloc(55 * 1024 * 1024 + 1)]));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, 'REQUEST_TOO_LARGE');
    assert.deepEqual(await readdir(root), []);
  }, async () => { calls++; return 'id'; });
  assert.equal(calls, 0);
});

test('rejects image over pixel limit and continues after publication failure', async () => {
  const large = await makeImage(8000, 5001, 'png');
  const image = await makeImage(20, 20);
  let calls = 0;
  await server(async url => {
    const response = await send(url, body([large, image, image]));
    const { results } = await response.json();
    assert.deepEqual(results.map(r => r.ok), [false, false, true]);
    assert.equal(results[0].error.code, 'INVALID_IMAGE');
    assert.equal(results[1].error.code, 'PUBLICATION_FAILED');
  }, async () => { if (++calls === 1) throw Error('storage failure'); return 'id'; });
});

test('client disconnect during upload cleans staging without publishing', async () => {
  let calls = 0;
  await server(async (url, root) => {
    const request = http.request(url, { method: 'POST', headers: { authorization: 'manager', 'content-type': 'multipart/form-data; boundary=boundary' } });
    request.on('error', () => {});
    request.write('--boundary\r\nContent-Disposition: form-data; name="photos"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');
    request.write(Buffer.alloc(1024));
    for (let i = 0; i < 100 && !(await readdir(root)).length; i++) await delay(10);
    assert.equal((await readdir(root)).length, 1);
    request.destroy();
    for (let i = 0; i < 100 && (await readdir(root)).length; i++) await delay(10);
    assert.deepEqual(await readdir(root), []);
  }, async () => { calls++; return 'id'; });
  assert.equal(calls, 0);
});
