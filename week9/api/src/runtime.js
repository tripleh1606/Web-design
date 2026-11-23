import { createRepository } from './database/repository.js';
import { createS3Storage } from './storage/s3.js';
import { createStorageLifecycle } from './storage/lifecycle.js';
import { createPublicationService } from './services/publication.js';
import { uploadLimits, parseUploadMetadata } from './services/contracts.js';
import { startCleanupWorker } from './cleanup/worker.js';

export async function createRuntime(config, { worker = true } = {}) {
  const repository = await createRepository(config.filename);
  let storage;
  try {
    storage = createS3Storage(config.s3);
    const lifecycle = createStorageLifecycle({ repository, storage });
    const failures = await lifecycle.recover();
    if (failures.length) console.warn(`Recovery pending: ${failures.length} job(s); retry enabled by the server worker.`);
    const cleanupWorker = worker ? startCleanupWorker({ lifecycle, repository, intervalSeconds: config.cleanupIntervalSeconds }) : null;
    return {
      config, repository, storage, lifecycle,
      publishPhoto: createPublicationService({ lifecycle }),
      limits: uploadLimits, parseUploadMetadata, recoveryFailures: failures.length,
      async close() { await cleanupWorker?.stop(); storage.close(); await repository.close(); },
    };
  } catch (error) { storage?.close(); await repository.close(); throw error; }
}
