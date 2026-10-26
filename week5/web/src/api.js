import { API_BASE_URL } from '/config.js';

export class ApiError extends Error {
  constructor(kind, message, { code, fields, status } = {}) {
    super(message);
    this.kind = kind;
    this.code = code;
    this.fields = fields || {};
    this.status = status;
  }
}

// Every page goes through this one boundary: network -> HTTP/JSON -> business.
export async function request(resource, { id, path, q, mode, category, sort, page, pageSize, minPrice, maxPrice, available, paginated = false, collection, method = 'GET', data, signal } = {}) {
  const suffix = path ? '/' + path.split('/').map(encodeURIComponent).join('/') : '';
  const url = new URL(`${API_BASE_URL.replace(/\/$/, '')}/${resource}${id === undefined ? '' : '/' + encodeURIComponent(id)}${suffix}`);
  for (const [key, value] of Object.entries({ q, mode, category, sort, page, pageSize, minPrice, maxPrice, available })) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  let response;
  try {
    response = await fetch(url, {
      method, signal,
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) })
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('technical', 'Không kết nối được máy chủ. Kiểm tra API và cấu hình CORS.');
  }
  if (!response.ok) throw new ApiError('technical', `Máy chủ trả HTTP ${response.status}. Vui lòng thử lại.`, { status: response.status });
  let body;
  try { body = await response.json(); }
  catch { throw new ApiError('technical', 'Máy chủ trả dữ liệu không phải JSON.'); }
  if (!body || typeof body !== 'object' || typeof body.ok !== 'boolean') throw new ApiError('technical', 'Response không đúng hợp đồng API.');
  if (!body.ok) {
    if (!body.error || typeof body.error.code !== 'string') throw new ApiError('technical', 'Response lỗi không đúng hợp đồng API.');
    throw new ApiError('business', body.error.message || 'Không thể thực hiện thao tác.', body.error);
  }
  if (!Object.hasOwn(body, 'data')) throw new ApiError('technical', 'Response thiếu data.');
  const validData = paginated ? body.error === null && body.data && Array.isArray(body.data.items) &&
    Number.isInteger(body.data.total) && body.data.total >= 0 &&
    Number.isInteger(body.data.page) && body.data.page >= 1 &&
    Number.isInteger(body.data.pageSize) && body.data.pageSize >= 1 && body.data.pageSize <= 100 &&
    body.data.items.length <= body.data.pageSize && body.data.items.every((row) => row && Number.isInteger(row.id) && row.id > 0) :
    method === 'DELETE' ? body.data === null :
    method === 'GET' && (collection ?? (id === undefined)) ? Array.isArray(body.data) :
      body.data && !Array.isArray(body.data) && typeof body.data === 'object';
  if (!validData) throw new ApiError('technical', 'Kiểu dữ liệu trong response không hợp lệ.');
  return body.data;
}

export const requestDishPage = (options) => request('dishes', { ...options, path: 'paged', paginated: true, collection: false });
