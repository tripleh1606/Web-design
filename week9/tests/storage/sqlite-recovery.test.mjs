import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteRepository } from '../../api/src/storage/sqlite-repository.js';
import { createStorageLifecycle } from '../../api/src/storage/lifecycle.js';

test('durable cleanup jobs survive reopen and preserve committed objects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-recovery-'));
  const path = join(dir, 'gallery.sqlite');
  const objects = new Set();
  let repository = createSqliteRepository(path);
  try {
    await repository.withLock(async () => {
      repository.createUploadManifest({ id: 'abandoned', photoId: 'one', keys: ['photos/one/320.webp'] });
      repository.createUploadManifest({ id: 'committed', photoId: 'two', keys: ['photos/two/320.webp'] });
      repository.publishPhoto({ id: 'two', title: 't', alt: 'a', width: 320, height: 200, variants: [{ width: 320, height: 200, bytes: 1, mime: 'image/webp', key: 'photos/two/320.webp' }] });
    });
    objects.add('photos/one/320.webp');
    objects.add('photos/two/320.webp');
    repository.close();
    repository = createSqliteRepository(path);
    const lifecycle = createStorageLifecycle({ repository, storage: { async delete(key) { objects.delete(key); } } });
    assert.deepEqual(await lifecycle.recover(), []);
    assert.deepEqual([...objects], ['photos/two/320.webp']);
    assert.equal(repository.listCleanupJobs().length, 0);
    assert.ok(repository.findPublishedVariant('two', 320));
    assert.deepEqual(await lifecycle.deletePhoto('two'), { found: true, pending: false });
    assert.equal(objects.size, 0);
    assert.equal(repository.findPublishedVariant('two', 320), null);
  } finally { repository.close(); rmSync(dir, { recursive: true, force: true }); }
});
