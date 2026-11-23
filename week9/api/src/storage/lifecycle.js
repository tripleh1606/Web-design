import { randomUUID } from 'node:crypto';

// Serialize local operations before acquiring the cross-process SQLite lock.
let tail = Promise.resolve();
function exclusive(fn) {
  const result = tail.then(fn, fn);
  tail = result.then(() => undefined, () => undefined);
  return result;
}

export function withStorageLock(repository, fn) {
  return exclusive(() => repository.withLock(fn));
}

/*
Repository contract (all methods must be backed by durable DB transactions):

withLock(fn): hold a crash-releasing exclusive lock until fn settles. All
  publication, deletion, recovery and media must use the same lock.

createUploadManifest({ id, photoId, keys }): commit the complete key list before
  returning; id is a unique job ID. Throw on any conflict or failed commit.
publishPhoto({ id, title, alt, width, height, variants }): atomically insert a
  published Photo and all PhotoVariants. Each variant has width, height, bytes,
  mime and key. The manifest must remain until removeUploadManifest succeeds.
findPublishedPhoto(id): return a truthy value only while the photo is published.
removeUploadManifest(id): idempotently remove an upload manifest by job ID.
beginDelete(photoId): atomically hide a published photo and persist a delete job
  {id, photoId, kind:'delete', keys:[...]}; return that job, an existing pending
  delete job, or null if the photo does not exist. Keys must survive metadata
  changes until finishDelete. Authorization is the caller's responsibility.
listCleanupJobs(): return all upload and delete jobs as {id, photoId, kind, keys}.
finishDelete(id): atomically mark cleanup complete/remove hidden metadata and job;
  idempotent, and must refuse to finalize a currently published photo.
findPublishedVariant(photoId, width): return {key, bytes, mime} only if the
  photo is published and the exact variant exists, otherwise null.

IDs/keys must never be reused, including after deletion. Repository methods may
throw on uncertain commits. No DB call may be implemented as an in-memory stub.
*/
export function createStorageLifecycle({ repository, storage }) {
  async function cleanup(job) {
    if (job.kind !== 'upload' && job.kind !== 'delete') throw new Error('Unknown cleanup job kind');
    // A commit may have succeeded even when the client saw an error. Never
    // delete objects unless the authoritative DB confirms they are not public.
    if (await repository.findPublishedPhoto(job.photoId)) {
      if (job.kind === 'upload') await repository.removeUploadManifest(job.id);
      return false;
    }
    for (const key of job.keys) await storage.delete(key);
    if (job.kind === 'upload') await repository.removeUploadManifest(job.id);
    else if (job.kind === 'delete') await repository.finishDelete(job.id);
    else throw new Error('Unknown cleanup job kind');
    return true;
  }

  return {
    publish(photo, variants) {
      return withStorageLock(repository, async () => {
        if (!Array.isArray(variants) || variants.length === 0 || new Set(variants.map(v => v.width)).size !== variants.length || variants.some(v => !Number.isSafeInteger(v.width) || v.width <= 0 || !Number.isSafeInteger(v.height) || v.height <= 0 || !Number.isSafeInteger(v.bytes) || v.bytes <= 0 || v.mime !== 'image/webp' || typeof v.path !== 'string')) {
          throw new TypeError('Invalid variants');
        }
        const id = randomUUID();
        const job = { id: randomUUID(), photoId: id, kind: 'upload', keys: variants.map(v => `photos/${id}/${v.width}.webp`) };
        await repository.createUploadManifest(job);
        try {
          for (let i = 0; i < variants.length; i++) await storage.put(job.keys[i], variants[i]);
          await repository.publishPhoto({ ...photo, id, variants: variants.map((v, i) => ({ width: v.width, height: v.height, bytes: v.bytes, mime: v.mime, key: job.keys[i] })) });
        } catch (error) {
          // Keep the manifest if either the authoritative check or cleanup fails.
          try { await cleanup(job); } catch { /* recovery retries durable job */ }
          throw error;
        }
        // Failure here does not undo a committed publication. Recovery will
        // recognize the published photo and remove the stale upload manifest.
        try { await repository.removeUploadManifest(job.id); } catch { /* recovery retries */ }
        return id;
      });
    },
    deletePhoto(id) {
      return withStorageLock(repository, async () => {
        const job = await repository.beginDelete(id);
        if (!job) return { found: false, pending: false };
        try { return { found: true, pending: !(await cleanup(job)) }; }
        catch { return { found: true, pending: true }; }
      });
    },
    recover() {
      return withStorageLock(repository, async () => {
        const jobs = await repository.listCleanupJobs();
        const failures = [];
        for (const job of jobs) {
          try { await cleanup(job); } catch (error) { failures.push({ id: job.id, error }); }
        }
        return failures;
      });
    },
  };
}
