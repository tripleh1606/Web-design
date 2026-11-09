// Client-side helpers for the admin combobox. Image fields are optional on the API records.

export function foldText(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function matchesPickerQuery(searchText, query) {
  const needle = foldText(query).trim();
  if (!needle) return true;
  return foldText(searchText).includes(needle);
}

export function safeImage(value) {
  const text = String(value ?? '').trim();
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  if (/^https?:\/\//i.test(text)) return text;
  return '';
}

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '•';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
  return (first + last).toLocaleUpperCase('vi-VN');
}

export function pickerImage(record) {
  if (!record || typeof record !== 'object') return '';
  return safeImage(record.image || record.imageUrl || record.avatar || record.photo || '');
}
