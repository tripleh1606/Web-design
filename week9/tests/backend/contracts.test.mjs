import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readConfig, databasePath } from '../../api/src/config.js';
import { parseUploadMetadata } from '../../api/src/services/contracts.js';
import { createPublicationService } from '../../api/src/services/publication.js';

test('multipart metadata contract rejects missing, extra, malformed and overlong values', () => {
  const rows = [{ title: ' Cảnh chiều ', alt: ' Mây trên núi ' }];
  assert.deepEqual(parseUploadMetadata(JSON.stringify(rows), 1), [{ title: 'Cảnh chiều', alt: 'Mây trên núi' }]);
  for (const [text, count] of [
    ['{', 1], ['[]', 0], ['[]', 6], ['[]', 1], [JSON.stringify(rows), 2],
    [JSON.stringify([{ title: 't' }]), 1], [JSON.stringify([{ ...rows[0], extra: true }]), 1],
    [JSON.stringify([{ title: ' ', alt: 'a' }]), 1], [JSON.stringify([{ title: 't'.repeat(161), alt: 'a' }]), 1],
    [JSON.stringify([{ title: 't', alt: 'a'.repeat(1001) }]), 1], [' '.repeat(32769), 1], ['[null]', 1],
  ]) assert.throws(() => parseUploadMetadata(text, count));
});

test('publication validates actual variant widths before any storage call', async () => {
  let calls = 0;
  const publish = createPublicationService({ lifecycle: { async publish() { calls++; return 'new-id'; } } });
  const photo = { title: 'T', alt: 'A', width: 200, height: 100 };
  const variant = { path: 'server.webp', width: 200, height: 100, bytes: 20, mime: 'image/webp' };
  assert.equal(await publish(photo, [variant]), 'new-id');
  for (const variants of [[], [variant, variant], [{ ...variant, width: 320 }], [{ ...variant, height: 120 }], [{ ...variant, bytes: 0 }], [{ ...variant, mime: 'image/png' }], [{ ...variant, path: '' }]]) await assert.rejects(publish(photo, variants));
  await assert.rejects(publish({ ...photo, width: 10000, height: 10000 }, [variant]));
  assert.equal(calls, 1);
});

test('configuration requires strong capability, persistent DB and secure HTTPS cookie', () => {
  const env = { MANAGE_CAPABILITY: randomBytes(32).toString('base64url'), S3_ENDPOINT: 'http://127.0.0.1:8333', S3_REGION: 'us-east-1', S3_BUCKET: 'test', S3_ACCESS_KEY_ID: 'test-key', S3_SECRET_ACCESS_KEY: 'test-secret' };
  const config = readConfig(env);
  assert.equal(config.port, 5091); assert.equal(config.secureCookie, false);
  assert.equal(readConfig({ ...env, PUBLIC_ORIGIN: 'https://gallery.example' }).secureCookie, true);
  for (const patch of [{ MANAGE_CAPABILITY: 'short' }, { PORT: '0' }, { PORT: '1.5' }, { S3_FORCE_PATH_STYLE: 'yes' }, { SESSION_TTL_SECONDS: '0' }, { PUBLIC_ORIGIN: 'https://gallery.example', COOKIE_SECURE: 'false' }, { PUBLIC_ORIGIN: 'https://gallery.example/path' }, { S3_ACCESS_KEY_ID: '' }]) assert.throws(() => readConfig({ ...env, ...patch }));
  for (const url of ['file::memory:', 'file:', 'postgres://example', 'file:a.sqlite?mode=memory']) assert.throws(() => databasePath(url));
});
