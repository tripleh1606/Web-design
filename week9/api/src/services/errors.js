export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);

export function errorHandler(error, req, res, next) {
  if (res.headersSent) { next(error); return; }
  let safe = error instanceof ApiError ? error : null;
  if (error.type === 'entity.too.large') safe = new ApiError(413, 'REQUEST_TOO_LARGE', 'Yêu cầu vượt giới hạn dung lượng.');
  if (error.type === 'entity.parse.failed') safe = new ApiError(400, 'INVALID_JSON', 'JSON không hợp lệ.');
  if (error instanceof URIError) safe = new ApiError(400, 'INVALID_URL', 'URL không hợp lệ.');
  res.setHeader('Cache-Control', 'no-store');
  res.status(safe?.status || 500).json({ error: { code: safe?.code || 'INTERNAL_ERROR', message: safe?.message || 'Không thể hoàn tất yêu cầu. Vui lòng thử lại sau.' } });
}
