export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'ApiError'; this.status = status; }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method, body, signal, credentials: 'same-origin', cache: 'no-store',
      headers: body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra kết nối rồi thử lại.');
  }
  let data;
  if (response.status !== 204) {
    try { data = await response.json(); }
    catch { throw new ApiError('Máy chủ trả dữ liệu không đúng hợp đồng JSON.', response.status); }
  }
  if (!response.ok) throw new ApiError(data?.error?.message || `Yêu cầu thất bại (${response.status}).`, response.status);
  return data;
}

export const api = {
  async list(page, signal) {
    const data = await request(`/api/photos?page=${page}&limit=12`, { signal });
    if (!Array.isArray(data?.items) || !Number.isSafeInteger(data.total) || data.total < 0 || data.page !== page || data.limit !== 12) {
      throw new ApiError('Danh sách ảnh chưa đúng hợp đồng API.');
    }
    return data;
  },
  async photo(id, signal) {
    const data = await request(`/api/photos/${encodeURIComponent(id)}`, { signal });
    if (!data?.photo?.id) throw new ApiError('Chi tiết ảnh chưa đúng hợp đồng API.');
    return data.photo;
  },
  async session(signal) {
    const data = await request('/api/manage/session', { signal });
    if (typeof data?.authenticated !== 'boolean') throw new ApiError('Trạng thái phiên chưa đúng hợp đồng API.');
    return data.authenticated;
  },
  login: capability => request('/api/manage/session', { method: 'POST', body: JSON.stringify({ capability }) }),
  logout: () => request('/api/manage/session', { method: 'DELETE' }),
  async upload(files, metadata) {
    const body = new FormData();
    body.append('metadata', JSON.stringify(metadata));
    for (const file of files) body.append('photos', file);
    const data = await request('/api/photos', { method: 'POST', body });
    if (!Array.isArray(data?.results) || data.results.length !== files.length ||
      data.results.some((r, i, rows) => !Number.isInteger(r.index) || r.index < 0 || r.index >= files.length ||
        rows.findIndex(item => item.index === r.index) !== i || typeof r.ok !== 'boolean' ||
        (r.ok ? !r.photo?.id : typeof r.error?.message !== 'string'))) {
      throw new ApiError('Máy chủ đã phản hồi nhưng kết quả upload không đúng hợp đồng. Kiểm tra Gallery trước khi gửi lại để tránh trùng ảnh.');
    }
    return data.results.sort((a, b) => a.index - b.index);
  },
  async remove(id) {
    const data = await request(`/api/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (data?.id !== id || !['complete', 'pending'].includes(data.cleanup)) throw new ApiError('Kết quả xóa chưa đúng hợp đồng. Kiểm tra Gallery trước khi thử lại.');
    return data;
  },
};
