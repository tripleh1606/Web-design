import { pipeline } from 'node:stream/promises';
import { withStorageLock } from '../storage/lifecycle.js';

// Mount as GET /media/:id/:width.webp. The lookup receives identifiers, not a
// client-supplied storage key. The backend controls the URL exposed in metadata.
export function createMediaHandler({ repository, storage }) {
  return async function media(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const widthText = req.params.width;
    if (typeof req.params.id !== 'string' || typeof widthText !== 'string' || !/^[1-9]\d*$/.test(widthText) || !Number.isSafeInteger(Number(widthText))) {
      res.status(404).end();
      return;
    }
    try {
      const object = await withStorageLock(repository, async () => {
        const variant = await repository.findPublishedVariant(req.params.id, Number(widthText));
        if (!variant) return null;
        // Acquire the object while deletion is excluded. The returned stream
        // must remain readable after the key is deleted from storage.
        const object = await storage.get(variant.key);
        if (!object.body || object.contentType !== 'image/webp' || variant.mime !== 'image/webp' || !Number.isSafeInteger(object.length) || object.length !== variant.bytes || !object.etag) {
          object.body?.destroy?.();
          throw new Error('Invalid storage object metadata');
        }
        return object;
      });
      if (!object) { res.status(404).end(); return; }
      if (res.destroyed) { object.body.destroy?.(); return; }
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Content-Length', String(object.length));
      res.setHeader('ETag', object.etag);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      await pipeline(object.body, res);
    } catch {
      if (res.headersSent || res.destroyed) { res.destroy(); return; }
      res.removeHeader('Content-Length');
      res.removeHeader('ETag');
      res.removeHeader('Content-Type');
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).end();
    }
  };
}
