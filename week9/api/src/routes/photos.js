import { Router } from 'express';
import { ApiError, asyncRoute } from '../services/errors.js';
import { serializePhoto } from '../services/contracts.js';

function pagination(query) {
  for (const key of Object.keys(query)) if (!['page', 'limit'].includes(key)) throw new ApiError(400, 'INVALID_PAGINATION', 'Tham số phân trang không hợp lệ.');
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new ApiError(400, 'INVALID_PAGINATION', 'Tham số phân trang không hợp lệ.');
    return Number(value);
  };
  // Bound offset as well as page size to keep pagination arithmetic safe.
  return { page: parse(query.page, 1, 1_000_000), limit: parse(query.limit, 12, 100) };
}

export function createPhotosRouter({ repository, lifecycle, manager, uploadHandler }) {
  const router = Router();
  router.get('/', asyncRoute(async (req, res) => {
    const result = await repository.listPublishedPhotos(pagination(req.query));
    res.json({ ...result, items: result.items.map(serializePhoto) });
  }));
  router.get('/:id', asyncRoute(async (req, res) => {
    const photo = await repository.findPublishedPhoto(req.params.id);
    if (!photo) throw new ApiError(404, 'PHOTO_NOT_FOUND', 'Không tìm thấy ảnh đã công bố.');
    res.json({ photo: serializePhoto(photo) });
  }));
  router.post('/', manager.requireOrigin, manager.requireSession, asyncRoute(uploadHandler || (() => {
    throw new ApiError(503, 'UPLOAD_NOT_READY', 'Pipeline upload chưa được tích hợp.');
  })));
  router.delete('/:id', manager.requireOrigin, manager.requireSession, asyncRoute(async (req, res) => {
    const result = await lifecycle.deletePhoto(req.params.id);
    if (!result.found) throw new ApiError(404, 'PHOTO_NOT_FOUND', 'Không tìm thấy ảnh hoặc công việc xóa đang chờ.');
    res.status(result.pending ? 202 : 200).json({ id: req.params.id, cleanup: result.pending ? 'pending' : 'complete' });
  }));
  return router;
}
