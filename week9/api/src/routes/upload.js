import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Router } from 'express';
import { receiveMultipart, RequestError } from '../upload/multipart.js';
import { ImageError, processImage } from '../upload/image.js';

// Authentication and Origin validation must both be performed by requireManager.
export function createUploadRouter({ requireManager, lifecycle, stagingRoot = tmpdir() }) {
  if (typeof requireManager !== 'function' || typeof lifecycle?.publish !== 'function') throw new TypeError('requireManager and lifecycle.publish are required');
  const router = Router();
  router.post('/api/photos', requireManager, async (req, res) => {
    let directory;
    let status = 200, body;
    try {
      directory = await mkdtemp(join(stagingRoot, 'gallery-upload-'));
      const { files, metadata } = await receiveMultipart(req, directory);
      const results = [];
      for (const file of files) {
        if (req.aborted || res.destroyed) break;
        try {
          if (file.tooLarge) throw new ImageError('FILE_TOO_LARGE', 'Ảnh vượt quá 10 MiB.');
          const image = await processImage(file.path, file.directory);
          if (req.aborted || res.destroyed) break;
          const id = await lifecycle.publish({ ...metadata[file.index], width: image.width, height: image.height }, image.variants);
          results.push({ index: file.index, ok: true, photo: { id } });
        } catch (error) {
          const known = error instanceof ImageError;
          results.push({ index: file.index, ok: false, error: { code: known ? error.code : 'PUBLICATION_FAILED', message: known ? error.message : 'Không thể lưu ảnh. Vui lòng thử lại.' } });
        }
      }
      body = { results };
    } catch (error) {
      const known = error instanceof RequestError;
      status = known ? error.status : 500;
      body = { error: { code: known ? error.code : 'UPLOAD_FAILED', message: known ? error.message : 'Không thể xử lý upload.' } };
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
    if (!res.destroyed) res.status(status).json(body);
  });
  return router;
}
