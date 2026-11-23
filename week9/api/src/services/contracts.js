import { ApiError } from './errors.js';

export const uploadLimits = Object.freeze({
  minFiles: 1, maxFiles: 5, maxFileBytes: 10 * 1024 ** 2,
  maxRequestBytes: 55 * 1024 ** 2, maxPixels: 40_000_000,
  maxFields: 1, maxParts: 6, maxFieldBytes: 32 * 1024,
  titleLength: 160, altLength: 1000,
  variantWidths: Object.freeze([320, 960, 1600]), imageConcurrency: 2,
});

export function validatePhotoMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_METADATA', 'Mô tả ảnh không hợp lệ.');
  const result = {};
  for (const [key, max] of [['title', uploadLimits.titleLength], ['alt', uploadLimits.altLength]]) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > max) throw new ApiError(400, 'INVALID_METADATA', `Trường ${key} phải có từ 1 đến ${max} ký tự và không chỉ chứa khoảng trắng.`);
    result[key] = value[key].trim();
  }
  return result;
}

// Person 2 calls only after multipart completion and request-level validation.
export function parseUploadMetadata(text, fileCount) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > uploadLimits.maxFieldBytes) throw new ApiError(400, 'INVALID_METADATA', 'Metadata không hợp lệ hoặc quá dài.');
  let rows;
  try { rows = JSON.parse(text); } catch { throw new ApiError(400, 'INVALID_METADATA', 'Metadata phải là JSON hợp lệ.'); }
  if (!Number.isInteger(fileCount) || fileCount < 1 || fileCount > 5 || !Array.isArray(rows) || rows.length !== fileCount) throw new ApiError(400, 'INVALID_METADATA', 'Metadata phải khớp từng file trong 1–5 ảnh.');
  return rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== 2 || !Object.hasOwn(row, 'title') || !Object.hasOwn(row, 'alt')) throw new ApiError(400, 'INVALID_METADATA', 'Mỗi mô tả chỉ được gồm title và alt.');
    return validatePhotoMetadata(row);
  });
}

export function validatePublication(photo, variants) {
  validatePhotoMetadata(photo);
  if (!Number.isSafeInteger(photo.width) || photo.width <= 0 || !Number.isSafeInteger(photo.height) || photo.height <= 0 || photo.width * photo.height > uploadLimits.maxPixels) throw new TypeError('Invalid normalized photo dimensions');
  const expected = [...new Set(uploadLimits.variantWidths.map(width => Math.min(width, photo.width)))];
  if (!Array.isArray(variants) || variants.length !== expected.length || new Set(variants.map(v => v.width)).size !== expected.length ||
    variants.some(v => !expected.includes(v.width) || !Number.isSafeInteger(v.height) || v.height <= 0 || Math.abs(v.height - photo.height * v.width / photo.width) > 1 || !Number.isSafeInteger(v.bytes) || v.bytes <= 0 || v.bytes > 2_147_483_647 || v.mime !== 'image/webp')) throw new TypeError('Variants must match the normalized source and 320/960/1600 width contract');
}

export function serializePhoto(photo) {
  return {
    id: photo.id, title: photo.title, alt: photo.alt, width: photo.width, height: photo.height, createdAt: photo.createdAt,
    variants: photo.variants.map(v => ({ width: v.width, height: v.height, bytes: v.bytes, mime: v.mime, url: `/media/${encodeURIComponent(photo.id)}/${v.width}.webp` })),
  };
}
