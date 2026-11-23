import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageLifecycle } from '../../api/src/storage/lifecycle.js';

function fixture() {
  const jobs = new Map(), photos = new Map(), objects = new Set();
  const repository = {
    async withLock(fn) { return fn(); },
    async createUploadManifest(job) { jobs.set(job.id, structuredClone(job)); },
    async publishPhoto(photo) { photos.set(photo.id, photo); },
    async findPublishedPhoto(id) { return photos.get(id)?.published !== false && photos.get(id); },
    async removeUploadManifest(id) { jobs.delete(id); },
    async beginDelete(id) {
      const photo = photos.get(id);
      if (!photo) return null;
      const existing = [...jobs.values()].find(j => j.kind === 'delete' && j.photoId === id);
      if (existing) return existing;
      photo.published = false;
      const job = { id: `delete-${id}`, photoId: id, kind: 'delete', keys: photo.variants.map(v => v.key) };
      jobs.set(job.id, job);
      return job;
    },
    async listCleanupJobs() { return [...jobs.values()]; },
    async finishDelete(id) { const job = jobs.get(id); if (job) { photos.delete(job.photoId); jobs.delete(id); } },
  };
  const storage = {
    async put(key) { objects.add(key); },
    async delete(key) { objects.delete(key); },
  };
  return { jobs, photos, objects, repository, storage, lifecycle: createStorageLifecycle({ repository, storage }) };
}
const variants = [{ width: 320, height: 200, bytes: 20, mime: 'image/webp', path: '/tmp/a' }, { width: 960, height: 600, bytes: 30, mime: 'image/webp', path: '/tmp/b' }];
const photo = { title: 'title', alt: 'alt', width: 960, height: 600 };

test('manifest precedes PUT and failed PUT remains recoverable when delete fails', async () => {
  const f = fixture();
  let puts = 0;
  f.storage.put = async key => { assert.equal(f.jobs.size, 1); f.objects.add(key); if (++puts === 2) throw Error('uncertain PUT'); };
  f.storage.delete = async () => { throw Error('offline'); };
  await assert.rejects(f.lifecycle.publish(photo, variants));
  assert.equal(f.jobs.size, 1);
  assert.equal(f.objects.size, 2);
  f.storage.delete = async key => { f.objects.delete(key); };
  assert.deepEqual(await f.lifecycle.recover(), []);
  assert.deepEqual(await f.lifecycle.recover(), []);
  assert.equal(f.jobs.size, 0);
  assert.equal(f.objects.size, 0);
});

test('ambiguous committed publication is never deleted', async () => {
  const f = fixture();
  f.repository.publishPhoto = async value => { f.photos.set(value.id, value); throw Error('connection lost after commit'); };
  await assert.rejects(f.lifecycle.publish(photo, variants));
  assert.equal(f.objects.size, 2);
  assert.equal(f.photos.size, 1);
  await f.lifecycle.recover();
  assert.equal(f.objects.size, 2);
});

test('delete hides before cleanup, retains job on failure, and recovery completes it', async () => {
  const f = fixture();
  const id = await f.lifecycle.publish(photo, variants);
  f.storage.delete = async () => { assert.equal(f.photos.get(id).published, false); throw Error('offline'); };
  assert.deepEqual(await f.lifecycle.deletePhoto(id), { found: true, pending: true });
  assert.equal(f.jobs.size, 1);
  f.storage.delete = async key => { f.objects.delete(key); };
  assert.deepEqual(await f.lifecycle.recover(), []);
  assert.equal(f.photos.size, 0);
  assert.equal(f.objects.size, 0);
});

test('recovery cannot race an in-flight publication', async () => {
  const f = fixture();
  let release, started;
  const begun = new Promise(resolve => { started = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  f.storage.put = async key => { f.objects.add(key); started(); await blocked; };
  const publish = f.lifecycle.publish(photo, variants);
  await begun;
  const recovery = f.lifecycle.recover();
  release();
  await publish;
  await recovery;
  assert.equal(f.photos.size, 1);
  assert.equal(f.objects.size, 2);
});
