import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteRepository } from '../../api/src/storage/sqlite-repository.js';
import { fixture, sourcePhoto, sampleVariants } from './helpers.mjs';

test('DB failure halfway through variant insertion rolls back Photo and every variant', async t => {
  const f = await fixture(t);
  f.sql(db => db.exec("CREATE TRIGGER reject_variant BEFORE INSERT ON photo_variants WHEN NEW.width=960 BEGIN SELECT RAISE(ABORT, 'injected DB failure'); END"));
  const large = { ...sourcePhoto, width: 960, height: 600 };
  const variants = [sampleVariants[0], { ...sampleVariants[0], width: 960, height: 600 }];
  const remove = f.storage.delete;
  f.storage.delete = async () => { throw new Error('cleanup offline'); };
  await assert.rejects(f.publish(large, variants));
  assert.equal(f.sql(db => db.prepare('SELECT COUNT(*) AS n FROM photos').get()).n, 0);
  assert.equal(f.sql(db => db.prepare('SELECT COUNT(*) AS n FROM photo_variants').get()).n, 0);
  assert.equal(f.objects.size, 2);
  const jobs = await f.repository.listCleanupJobs();
  assert.equal(jobs.length, 1); assert.equal(jobs[0].keys.length, 2);
  await f.restart();
  f.storage.delete = remove;
  assert.deepEqual(await f.lifecycle.recover(), []);
  assert.equal(f.objects.size, 0); assert.equal((await f.repository.listCleanupJobs()).length, 0);
});

test('recovery removes a stale committed upload manifest without deleting published objects', async t => {
  const f = await fixture(t);
  const remove = f.repository.removeUploadManifest;
  f.repository.removeUploadManifest = async () => { throw new Error('manifest removal interrupted'); };
  const id = await f.publish(sourcePhoto, sampleVariants);
  assert.equal((await f.repository.listCleanupJobs()).length, 1);
  f.repository.removeUploadManifest = remove;
  await f.restart();
  assert.deepEqual(await f.lifecycle.recover(), []);
  assert.equal(f.objects.size, 1); assert.equal((await f.repository.listCleanupJobs()).length, 0);
  assert.ok(await f.repository.findPublishedPhoto(id));
  assert.equal((await f.request(`/media/${id}/320.webp`)).status, 200);
});

test('uncertain DB commit is checked against durable Photo before deleting any objects', async t => {
  const f = await fixture(t);
  const commit = f.repository.publishPhoto;
  f.repository.publishPhoto = async photo => { await commit(photo); throw new Error('response lost after commit'); };
  await assert.rejects(f.publish(sourcePhoto, sampleVariants));
  const result = await f.repository.listPublishedPhotos({ page: 1, limit: 12 });
  assert.equal(result.total, 1); assert.equal(f.objects.size, 1);
  await f.restart();
  assert.deepEqual(await f.lifecycle.recover(), []);
  assert.equal(f.objects.size, 1);
  assert.ok(await f.repository.findPublishedPhoto(result.items[0].id));
});

test('Prisma and Person 3 SQLite adapter share tables, durable manifests and recovery', async t => {
  const f = await fixture(t);
  const legacy = createSqliteRepository(f.filename);
  try {
    await legacy.withLock(async () => {
      legacy.createUploadManifest({ id: 'old-abandoned-job', photoId: 'abandoned', keys: ['photos/abandoned/320.webp'] });
      legacy.createUploadManifest({ id: 'old-committed-job', photoId: 'committed', keys: ['photos/committed/320.webp'] });
      legacy.publishPhoto({ ...sourcePhoto, id: 'committed', variants: [{ ...sampleVariants[0], key: 'photos/committed/320.webp' }] });
    });
  } finally { legacy.close(); }
  f.objects.set('photos/abandoned/320.webp', {});
  f.objects.set('photos/committed/320.webp', {});
  assert.deepEqual(await f.lifecycle.recover(), []);
  assert.deepEqual([...f.objects.keys()], ['photos/committed/320.webp']);
  assert.ok(await f.repository.findPublishedPhoto('committed'));
  assert.equal((await f.repository.listCleanupJobs()).length, 0);
});

test('delete transaction rolls back visibility if persisting the cleanup job fails', async t => {
  const f = await fixture(t);
  const id = await f.publish(sourcePhoto, sampleVariants);
  f.sql(db => db.exec("CREATE TRIGGER reject_delete_job BEFORE INSERT ON cleanup_jobs WHEN NEW.kind='delete' BEGIN SELECT RAISE(ABORT, 'injected job failure'); END"));
  const { cookie } = await f.login();
  const response = await f.request(`/api/photos/${id}`, { method: 'DELETE', headers: { Cookie: cookie, Origin: f.config.publicOrigin } });
  assert.equal(response.status, 500);
  assert.ok(await f.repository.findPublishedPhoto(id));
  assert.equal(f.objects.size, 1);
  assert.equal((await f.repository.listCleanupJobs()).length, 0);
});
