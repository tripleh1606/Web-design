import { esc } from './escape.js';
import { ApiError } from './api.js';
import * as api from './api.js';
import { initials, matchesPickerQuery, pickerImage } from './picker.js';

const app = document.querySelector('#app');
const resources = {
  dishes: {
    singular: 'Món ăn',
    plural: 'Món ăn',
    fields: [
      { key: 'name', label: 'Tên món', required: true },
      { key: 'description', label: 'Mô tả', multiline: true },
      { key: 'price', label: 'Giá (VND)', required: true, type: 'number' },
      { key: 'category', label: 'Danh mục' },
      { key: 'image', label: 'Ảnh món' },
      { key: 'available', label: 'Đang phục vụ', type: 'checkbox' }
    ]
  },
  chefs: {
    singular: 'Đầu bếp',
    plural: 'Đầu bếp',
    fields: [
      { key: 'name', label: 'Tên đầu bếp', required: true },
      { key: 'specialty', label: 'Chuyên môn', required: true }
    ]
  },
  ingredients: {
    singular: 'Nguyên liệu',
    plural: 'Nguyên liệu',
    fields: [
      { key: 'name', label: 'Tên nguyên liệu', required: true },
      { key: 'unit', label: 'Đơn vị', required: true },
      { key: 'stock', label: 'Tồn kho', required: true, type: 'number' }
    ]
  }
};

const categories = [
  { id: 'matcha', name: 'Matcha' },
  { id: 'houjicha', name: 'Houjicha' }
];

const icons = { dishes: '🍵', chefs: '👨‍🍳', ingredients: '🌿' };

// First successful visit of a menu filter or admin tab is kept here.
// Record pages always refetch. Writes bump the epoch so the next visit reloads.
const tabCache = new Map();
let menuEpoch = 0;
const adminEpoch = { dishes: 0, chefs: 0, ingredients: 0 };
let token = 0;
let pageSubmit = null;

function categoryLabel(id) {
  return categories.find((entry) => entry.id === id)?.name || id || 'Món khác';
}

function formatVND(value) {
  return `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

function alive(current) {
  return current === token;
}

function startView() {
  token += 1;
  pageSubmit = null;
  return token;
}

function show(title, html) {
  document.title = `${title} · Soucha`;
  app.dataset.ready = 'true';
  app.removeAttribute('aria-busy');
  app.innerHTML = html;
}

function showLoading(title) {
  document.title = `${title} · Soucha`;
  app.dataset.ready = 'true';
  app.setAttribute('aria-busy', 'true');
  app.innerHTML = '<p class="admin-count" role="status">Đang tải…</p>';
}

function viewError(message) {
  return `<section class="error-card"><h1>Không tải được dữ liệu</h1><p>${esc(message)}</p><button class="button primary" type="button" data-retry>Thử lại</button></section>`;
}

function viewNotFound() {
  const back = location.pathname.startsWith('/admin') ? '/admin/dishes' : '/dishes';
  return `<section class="error-card"><h1>Không tìm thấy</h1><p>Trang hoặc bản ghi này không tồn tại.</p><a class="button primary" href="${back}">Quay lại</a></section>`;
}

function failView(current, error) {
  if (!alive(current)) return;
  if (error instanceof ApiError && error.kind === 'business' && error.code === 'NOT_FOUND') {
    show('Không tìm thấy', viewNotFound());
    return;
  }
  const message = error instanceof ApiError ? error.message : 'Không tải được dữ liệu.';
  show('Lỗi', viewError(message));
}

function loadMenu(key, factory) {
  const full = `menu:${key}`;
  if (tabCache.has(full)) return Promise.resolve(tabCache.get(full));
  const epoch = menuEpoch;
  return factory().then((data) => {
    if (menuEpoch === epoch) tabCache.set(full, data);
    return data;
  });
}

function dropMenus() {
  menuEpoch += 1;
  for (const key of tabCache.keys()) {
    if (key.startsWith('menu:')) tabCache.delete(key);
  }
}

function loadAdmin(resource, factory) {
  const key = `admin:${resource}`;
  if (tabCache.has(key)) return Promise.resolve(tabCache.get(key));
  const epoch = adminEpoch[resource];
  return factory().then((data) => {
    if (adminEpoch[resource] === epoch) tabCache.set(key, data);
    return data;
  });
}

function dropAdmin(resource) {
  adminEpoch[resource] += 1;
  tabCache.delete(`admin:${resource}`);
  if (resource === 'dishes') dropMenus();
}

function menuQuery() {
  const params = new URLSearchParams(location.search);
  const sort = params.get('sort');
  return {
    q: (params.get('q') || '').trim().slice(0, 120),
    category: (params.get('category') || '').trim().slice(0, 120),
    sort: sort === 'price-asc' || sort === 'price-desc' ? sort : 'default'
  };
}

function menuHref({ q = '', category = '', sort = 'default' } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q.trim().slice(0, 120));
  if (category) params.set('category', category);
  if (sort && sort !== 'default') params.set('sort', sort);
  const qs = params.toString();
  return qs ? `/dishes?${qs}` : '/dishes';
}

function menuParams(query) {
  const params = {};
  if (query.q) params.q = query.q;
  if (query.category) params.category = query.category;
  if (query.sort !== 'default') params.sort = query.sort;
  return params;
}

function integerOrRaw(value) {
  const text = String(value ?? '').trim();
  if (/^(0|[1-9]\d*)$/.test(text)) return Number(text);
  return text;
}

function blankValues(resource) {
  const values = {};
  for (const field of resources[resource].fields) {
    values[field.key] = field.type === 'checkbox' ? true : '';
  }
  return values;
}

function valuesFromRecord(resource, record) {
  const values = {};
  for (const field of resources[resource].fields) {
    const raw = record[field.key];
    values[field.key] = field.type === 'checkbox' ? Boolean(raw) : (raw ?? '');
  }
  return values;
}

function readForm(resource, form) {
  const values = {};
  for (const field of resources[resource].fields) {
    const input = form.elements.namedItem(field.key);
    values[field.key] = field.type === 'checkbox' ? input.checked : input.value;
  }
  return values;
}

function toPayload(resource, values) {
  const body = {};
  for (const field of resources[resource].fields) {
    if (field.type === 'checkbox') body[field.key] = Boolean(values[field.key]);
    else if (field.type === 'number') body[field.key] = integerOrRaw(values[field.key]);
    else body[field.key] = values[field.key];
  }
  return body;
}

function crumbs(items) {
  return `<div class="breadcrumb">${items.map((item, index) => {
    const node = item.href ? `<a href="${item.href}">${esc(item.label)}</a>` : `<span>${esc(item.label)}</span>`;
    return index ? `<span>/</span>${node}` : node;
  }).join('')}</div>`;
}

function adminTabs(active) {
  const items = [['dishes', 'Quản lý món'], ['chefs', 'Đầu bếp'], ['ingredients', 'Nguyên liệu']];
  return `<nav class="admin-tabs" aria-label="Khu vực quản lý">${items.map(([id, label]) => {
    const current = id === active ? ' class="active" aria-current="page"' : '';
    return `<a href="/admin/${id}"${current}>${label}</a>`;
  }).join('')}</nav>`;
}

function fieldControl(field, values, errors) {
  const error = errors[field.key];
  const invalid = error ? ' aria-invalid="true"' : '';
  const described = error ? ` aria-describedby="error-${field.key}"` : '';
  if (field.type === 'checkbox') {
    const checked = values[field.key] ? ' checked' : '';
    return `<label class="checkbox-row" for="field-${field.key}"><input id="field-${field.key}" name="${field.key}" type="checkbox"${checked}><span><strong>${esc(field.label)}</strong><small>Bỏ chọn nếu món tạm hết.</small></span></label>${error ? `<p class="field-error" id="error-${field.key}">${esc(error)}</p>` : ''}`;
  }
  const value = esc(values[field.key] ?? '');
  const control = field.multiline
    ? `<textarea id="field-${field.key}" name="${field.key}" rows="4" maxlength="1000"${invalid}${described}>${value}</textarea>`
    : `<input id="field-${field.key}" name="${field.key}" type="${field.type === 'number' ? 'number' : 'text'}" value="${value}"${field.type === 'number' ? ' min="0" step="1"' : ' maxlength="120"'}${invalid}${described}>`;
  const hint = field.key === 'image' ? '<small class="field-hint">Ví dụ: /beverages/matcha-latte.jpeg</small>' : '';
  const message = error ? `<p class="field-error" id="error-${field.key}">${esc(error)}</p>` : '';
  return `<div class="field"><label for="field-${field.key}">${esc(field.label)}${field.required ? ' *' : ''}</label>${control}${hint}${message}</div>`;
}

function thumbMarkup(image, fallback) {
  if (image) return `<img src="${esc(image)}" alt="">`;
  if (!fallback) return '';
  return `<span>${esc(fallback)}</span>`;
}

function pickerField({ id, label, required, placeholder, options, value, error, hint }) {
  const selected = options.find((item) => String(item.id) === String(value));
  const listId = `list-${id}`;
  const invalid = error ? ' aria-invalid="true"' : '';
  const described = error ? ` aria-describedby="error-${id}"` : '';
  const items = options.map((item) => {
    const image = item.image || '';
    const fallback = item.fallback || initials(item.fallbackName || item.title || item.label);
    const chosen = selected && String(selected.id) === String(item.id);
    return `<li role="option" id="opt-${id}-${esc(item.id)}" class="picker-option" data-picker-option data-value="${esc(item.id)}" data-label="${esc(item.label)}" data-search="${esc(item.search || item.label)}" data-image="${esc(image)}" data-fallback="${esc(fallback)}" aria-selected="${chosen ? 'true' : 'false'}"><span class="picker-thumb" aria-hidden="true">${thumbMarkup(image, fallback)}</span><span class="picker-copy"><strong>${esc(item.title || item.label)}</strong>${item.meta ? `<small>${esc(item.meta)}</small>` : ''}</span></li>`;
  }).join('');
  const current = selected ? thumbMarkup(selected.image || '', selected.fallback || initials(selected.fallbackName || selected.title || selected.label)) : '';
  const message = error ? `<p class="field-error" id="error-${id}">${esc(error)}</p>` : '';
  const hintHtml = hint ? `<small class="field-hint">${esc(hint)}</small>` : '';
  return `<div class="field"><label for="field-${id}">${esc(label)}${required ? ' *' : ''}</label><div class="picker${selected ? ' is-set' : ''}" data-picker><input type="hidden" name="${id}" value="${selected ? esc(selected.id) : ''}"><div class="picker-control"><span class="picker-current${selected ? '' : ' is-empty'}" aria-hidden="true">${current}</span><input id="field-${id}" class="picker-input" type="text" role="combobox" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}" value="${selected ? esc(selected.label) : ''}" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}"${required ? ' aria-required="true"' : ''}${invalid}${described}><button class="picker-clear" type="button" aria-label="Bỏ chọn">×</button><button class="picker-toggle" type="button" tabindex="-1" aria-hidden="true"></button></div><ul class="picker-list" id="${listId}" role="listbox" hidden>${items}<li class="picker-empty" data-empty="none" role="presentation"${options.length ? ' hidden' : ''}>Chưa có lựa chọn nào.</li><li class="picker-empty" data-empty="miss" role="presentation" hidden>Không có kết quả phù hợp.</li></ul></div>${hintHtml}${message}</div>`;
}

function ingredientPickerOptions(items) {
  return items.map((item) => ({
    id: item.id,
    label: `${item.name} (${item.unit})`,
    title: item.name,
    meta: [`Đơn vị ${item.unit}`, item.stock != null ? `Tồn ${item.stock}` : ''].filter(Boolean).join(' · '),
    search: `${item.name} ${item.unit || ''}`,
    image: pickerImage(item),
    fallbackName: item.name
  }));
}

function dishPickerOptions(items) {
  return items.map((item) => ({
    id: item.id,
    label: item.name,
    title: item.name,
    meta: `${categoryLabel(item.category)} · ${formatVND(item.price)}`,
    search: `${item.name} ${categoryLabel(item.category)}`,
    image: pickerImage(item),
    fallbackName: item.name
  }));
}

function chefPickerOptions(items) {
  return items.map((item) => ({
    id: item.id,
    label: item.specialty ? `${item.name} · ${item.specialty}` : item.name,
    title: item.name,
    meta: item.specialty || '',
    search: `${item.name} ${item.specialty || ''}`,
    image: pickerImage(item),
    fallbackName: item.name
  }));
}

function chefAssignmentHint(state) {
  if (state.chefHint) return state.chefHint;
  const ids = state.assignedChefIds || [];
  if (!state.assignmentKnown || ids.length < 2) return '';
  const names = ids.map((id) => {
    const chef = (state.chefs || []).find((item) => String(item.id) === String(id));
    return chef?.name || `#${id}`;
  });
  return `Đã gán: ${names.join(', ')}. Chọn để gán thêm.`;
}

// ponytail: one GET /api/chefs/:id/dishes per chef. Ceiling is a short roster. Upgrade path: GET /api/dishes/:id/chefs.
async function chefsForDish(dishId, chefs) {
  if (!chefs.length) return { known: true, ids: [] };
  const pages = await Promise.all(chefs.map((chef) => api.getChefDishes(chef.id).then((page) => page, () => null)));
  if (pages.some((page) => !page)) return { known: false, ids: [] };
  const ids = [];
  for (const page of pages) {
    if (page.assigned.some((row) => String(row.dishId) === String(dishId))) ids.push(String(page.chef.id));
  }
  return { known: true, ids };
}

async function attachChefs(state, dishId) {
  state.chefs = [];
  state.assignedChefIds = [];
  state.assignmentKnown = false;
  try {
    state.chefs = await loadAdmin('chefs', () => api.list('chefs'));
    if (dishId == null) {
      state.assignmentKnown = true;
      return;
    }
    const found = await chefsForDish(dishId, state.chefs);
    state.assignmentKnown = found.known;
    state.assignedChefIds = found.ids;
    if (found.known && found.ids.length === 1) state.chefId = found.ids[0];
  } catch {
    state.chefs = [];
    state.assignmentKnown = false;
    state.chefHint = 'Không tải được danh sách đầu bếp. Món vẫn lưu được.';
  }
}

async function addChefLink(chefId, dishId) {
  try {
    await api.addChefDish(chefId, { dishId: integerOrRaw(dishId) });
  } catch (error) {
    const message = error instanceof ApiError ? (error.fields && error.fields.dishId) || '' : '';
    if (error instanceof ApiError && error.code === 'VALIDATION_FAILED' && message.includes('đã được gán')) return;
    throw error;
  }
}

async function syncChefAssignment(dishId, state, nextId) {
  const next = String(nextId || '');
  const prev = (state.assignedChefIds || []).map(String);
  if (!state.assignmentKnown) {
    if (next) await addChefLink(next, dishId);
    return;
  }
  if (prev.length > 1) {
    if (next && !prev.includes(next)) await addChefLink(next, dishId);
    return;
  }
  const previous = prev[0] || '';
  if (previous === next) return;
  if (next) await addChefLink(next, dishId);
  if (previous) await api.removeChefDish(previous, dishId);
}

function menuHtml(dishes, query) {
  const tabs = [['', 'Tất cả'], ...categories.map((item) => [item.id, item.name])].map(([id, label]) => {
    const active = query.category === id;
    const href = esc(menuHref({ q: query.q, category: id, sort: query.sort }));
    return `<a class="${active ? 'active' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
  }).join('');
  const cards = dishes.length ? `<div class="product-grid">${dishes.map((dish) => {
    const href = `/dishes/${encodeURIComponent(dish.id)}`;
    const image = dish.image
      ? `<img src="${esc(dish.image)}" alt="${esc(dish.name)}">`
      : '<span aria-hidden="true">🍵</span>';
    return `<article class="product-card"><a class="product-image" href="${href}" aria-label="Xem ${esc(dish.name)}">${image}</a><div class="product-info"><div><span class="product-category">${esc(categoryLabel(dish.category))}</span><h2><a href="${href}">${esc(dish.name)}</a></h2></div><div class="product-bottom"><div><strong>${esc(formatVND(dish.price))}</strong><small>${dish.available ? 'Đang phục vụ' : 'Tạm hết'}</small></div><a class="product-open" href="${href}" aria-label="Xem chi tiết ${esc(dish.name)}">+</a></div></div></article>`;
  }).join('')}</div>` : '<div class="empty-state"><p>Không tìm thấy món trà phù hợp.</p><a href="/dishes">Xem lại tất cả món</a></div>';
  return `<section class="search-band"><form id="search-form" class="search-form" role="search"><label class="sr-only" for="dish-search">Tìm món theo tên</label><input id="dish-search" name="q" type="search" value="${esc(query.q)}" placeholder="Xin chào, bạn cần gì hôm nay?" maxlength="120"><button type="submit" aria-label="Tìm kiếm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m16 16 5 5"></path></svg></button></form></section><div class="menu-content"><nav class="category-tabs" aria-label="Danh mục">${tabs}</nav><div class="menu-heading"><div><h1>Menu</h1><p>${dishes.length} món${query.q ? ` · kết quả cho “${esc(query.q)}”` : ''}</p></div><form id="sort-form" class="sort-form"><label for="sort">Sắp xếp:</label><select id="sort" name="sort"><option value="default"${query.sort === 'default' ? ' selected' : ''}>Thứ tự</option><option value="price-asc"${query.sort === 'price-asc' ? ' selected' : ''}>Giá tăng dần</option><option value="price-desc"${query.sort === 'price-desc' ? ' selected' : ''}>Giá giảm dần</option></select><button type="submit">Áp dụng</button></form></div>${cards}</div>`;
}

function bindMenu(query) {
  pageSubmit = (form) => {
    if (form.id === 'search-form') return go(menuHref({ ...query, q: form.elements.q.value }));
    if (form.id === 'sort-form') return go(menuHref({ ...query, sort: form.elements.sort.value }));
    return undefined;
  };
}

async function dishesPage(_groups, current) {
  const query = menuQuery();
  const key = `${query.category}|${query.q}|${query.sort}`;
  const cacheKey = `menu:${key}`;
  if (tabCache.has(cacheKey)) {
    show('Thực đơn', menuHtml(tabCache.get(cacheKey), query));
    bindMenu(query);
    return;
  }
  showLoading('Thực đơn');
  try {
    const dishes = await loadMenu(key, () => api.list('dishes', menuParams(query)));
    if (!alive(current)) return;
    show('Thực đơn', menuHtml(dishes, query));
    bindMenu(query);
  } catch (error) {
    failView(current, error);
  }
}

async function dishPage(groups, current) {
  showLoading('Món ăn');
  try {
    const dish = await api.getOne('dishes', groups[0]);
    if (!alive(current)) return;
    const image = dish.image
      ? `<img src="${esc(dish.image)}" alt="${esc(dish.name)}">`
      : '<span aria-hidden="true">🍵</span>';
    const created = dish.createdAt ? `<div><dt>Ngày tạo</dt><dd>${esc(formatDate(dish.createdAt))}</dd></div>` : '';
    show(dish.name, `<div class="page-content">${crumbs([{ href: '/dishes', label: 'Menu' }, { label: dish.name }])}<article class="dish-detail"><div class="detail-image">${image}</div><div class="detail-info"><span class="product-category">${esc(categoryLabel(dish.category))}</span><h1>${esc(dish.name)}</h1><p class="detail-price">${esc(formatVND(dish.price))}</p><p class="detail-description">${esc(dish.description || 'Một món trà trong thực đơn Soucha, được chuẩn bị từ nguyên liệu chọn lọc.')}</p><dl><div><dt>Trạng thái</dt><dd>${dish.available ? 'Đang phục vụ' : 'Tạm hết'}</dd></div><div><dt>Mã món</dt><dd>#${esc(dish.id)}</dd></div>${created}</dl><a class="button secondary" href="/dishes">← Quay lại menu</a></div></article></div>`);
  } catch (error) {
    failView(current, error);
  }
}

function rowSummary(resource, row) {
  if (resource === 'dishes') {
    return `${categoryLabel(row.category)} · ${formatVND(row.price)} · ${row.available ? 'Đang bán' : 'Đã tắt'}`;
  }
  if (resource === 'chefs') return row.specialty || '';
  return `Đơn vị: ${row.unit} · Tồn kho: ${row.stock}`;
}

function adminListHtml(resource, rows) {
  const config = resources[resource];
  const body = rows.length ? `<div class="admin-list">${rows.map((row) => {
    const id = encodeURIComponent(row.id);
    const thumb = resource === 'dishes' && row.image
      ? `<img src="${esc(row.image)}" alt="">`
      : `<span aria-hidden="true">${icons[resource]}</span>`;
    const name = resource === 'ingredients'
      ? esc(row.name)
      : `<a href="/admin/${resource}/${id}">${esc(row.name)}</a>`;
    const extra = resource === 'dishes'
      ? `<a class="chip chip-go" href="/admin/dishes/${id}">Công thức</a>`
      : resource === 'chefs' ? `<a class="chip chip-go" href="/admin/chefs/${id}">Món</a>` : '';
    return `<article class="admin-row"><div class="admin-thumb">${thumb}</div><div class="admin-row-copy"><h2>${name}</h2><p>${esc(rowSummary(resource, row))}</p></div><div class="admin-actions">${extra}<a class="chip chip-edit" href="/admin/${resource}/${id}/edit">Sửa</a><a class="chip chip-delete" href="/admin/${resource}/${id}/delete">Xóa</a></div></article>`;
  }).join('')}</div>` : `<div class="empty-state"><p>Chưa có ${esc(config.singular.toLowerCase())} nào.</p><a href="/admin/${resource}/new">Thêm mới</a></div>`;
  return `<div class="admin-content"><div class="admin-heading"><div><h1>Soucha Admin</h1><p>Quản lý ${esc(config.plural.toLowerCase())}</p></div><a class="button primary" href="/admin/${resource}/new">+ Thêm ${esc(config.singular.toLowerCase())}</a></div>${adminTabs(resource)}<p class="admin-count">${rows.length} bản ghi</p>${body}</div>`;
}

async function adminListPage(groups, current) {
  const resource = groups[0];
  const cacheKey = `admin:${resource}`;
  if (tabCache.has(cacheKey)) {
    show(resources[resource].plural, adminListHtml(resource, tabCache.get(cacheKey)));
    return;
  }
  showLoading(resources[resource].plural);
  try {
    const params = resource === 'dishes' ? { sort: 'newest' } : undefined;
    const rows = await loadAdmin(resource, () => api.list(resource, params));
    if (!alive(current)) return;
    show(resources[resource].plural, adminListHtml(resource, rows));
  } catch (error) {
    failView(current, error);
  }
}

function formHtml(resource, state) {
  const { record, values, errors, showAlert } = state;
  const config = resources[resource];
  const title = record ? `Sửa ${config.singular.toLowerCase()}` : `Thêm ${config.singular.toLowerCase()}`;
  const alert = showAlert ? '<div class="form-alert" role="alert">Vui lòng kiểm tra các trường được đánh dấu bên dưới.</div>' : '';
  const chefField = resource === 'dishes' ? pickerField({
    id: 'chefId',
    label: 'Đầu bếp',
    placeholder: 'Tìm đầu bếp theo tên hoặc chuyên môn',
    options: chefPickerOptions(state.chefs || []),
    value: state.chefId || '',
    error: errors.chefId,
    hint: chefAssignmentHint(state)
  }) : '';
  const fields = config.fields.map((field) => {
    if (resource === 'dishes' && field.key === 'available') return chefField + fieldControl(field, values, errors);
    return fieldControl(field, values, errors);
  }).join('');
  return `<div class="admin-content">${crumbs([{ href: `/admin/${resource}`, label: config.plural }, { label: record ? 'Sửa' : 'Thêm' }])}<div class="form-layout"><div><h1>${esc(title)}</h1><p>Thông tin được kiểm tra trước khi lưu.</p></div><form id="resource-form" class="form-card" novalidate>${alert}${fields}<div class="form-actions"><button class="button primary" type="submit">${record ? 'Lưu thay đổi' : 'Thêm mới'}</button><a class="button secondary" href="/admin/${resource}">Hủy</a></div></form></div></div>`;
}

function paintForm(resource, state) {
  const title = state.record ? `Sửa ${resources[resource].singular.toLowerCase()}` : `Thêm ${resources[resource].singular.toLowerCase()}`;
  show(title, formHtml(resource, state));
  const invalid = app.querySelector('[aria-invalid="true"]');
  if (invalid) invalid.focus();
  pageSubmit = (form) => {
    if (form.id === 'resource-form') return submitResource(form, { ...state, resource });
    return undefined;
  };
}

async function submitResource(form, state) {
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  const values = readForm(state.resource, form);
  const chefId = state.resource === 'dishes' ? (form.elements.chefId?.value || '') : '';
  try {
    const saved = state.record
      ? await api.update(state.resource, state.record.id, toPayload(state.resource, values))
      : await api.create(state.resource, toPayload(state.resource, values));
    if (!alive(state.token)) return;
    if (state.resource === 'dishes') {
      try {
        await syncChefAssignment(saved.id, state, chefId);
      } catch (error) {
        if (!alive(state.token)) return;
        dropAdmin('dishes');
        if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
          paintForm('dishes', {
            ...state,
            record: saved,
            values,
            chefId,
            errors: { chefId: (error.fields && error.fields.dishId) || 'Không gán được đầu bếp.' },
            showAlert: true
          });
          return;
        }
        failView(state.token, error);
        return;
      }
    }
    dropAdmin(state.resource);
    const next = state.resource === 'dishes' ? `/dishes/${saved.id}` : `/admin/${state.resource}`;
    await go(next);
  } catch (error) {
    if (!alive(state.token)) return;
    if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
      paintForm(state.resource, {
        ...state,
        values,
        chefId,
        errors: error.fields || {},
        showAlert: true
      });
      return;
    }
    failView(state.token, error);
  }
}

function blankFormState(resource, current) {
  return {
    token: current,
    record: null,
    values: blankValues(resource),
    errors: {},
    showAlert: false,
    chefs: [],
    chefId: '',
    assignedChefIds: [],
    assignmentKnown: true
  };
}

async function adminCreatePage(groups, current) {
  const resource = groups[0];
  const state = blankFormState(resource, current);
  if (resource === 'dishes') {
    if (!tabCache.has('admin:chefs')) showLoading('Thêm món ăn');
    await attachChefs(state, null);
    if (!alive(current)) return;
  }
  paintForm(resource, state);
}

async function adminEditPage(groups, current) {
  const resource = groups[0];
  showLoading(`Sửa ${resources[resource].singular.toLowerCase()}`);
  try {
    const record = await api.getOne(resource, groups[1]);
    if (!alive(current)) return;
    const state = {
      ...blankFormState(resource, current),
      record,
      values: valuesFromRecord(resource, record)
    };
    if (resource === 'dishes') {
      await attachChefs(state, record.id);
      if (!alive(current)) return;
    }
    paintForm(resource, state);
  } catch (error) {
    failView(current, error);
  }
}

async function adminDeletePage(groups, current) {
  const resource = groups[0];
  const id = groups[1];
  showLoading('Xác nhận xóa');
  try {
    const record = await api.getOne(resource, id);
    if (!alive(current)) return;
    const config = resources[resource];
    show(`Xóa ${config.singular.toLowerCase()}`, `<div class="admin-content">${crumbs([{ href: `/admin/${resource}`, label: config.plural }, { label: 'Xác nhận xóa' }])}<section class="confirm-card"><p class="danger-label">XÁC NHẬN THAO TÁC</p><h1>Xóa ${esc(config.singular.toLowerCase())}?</h1><p>Bạn sắp xóa <strong>“${esc(record.name)}”</strong> (#${esc(record.id)}). Chỉ khi bấm xác nhận bên dưới, dữ liệu mới bị xóa.</p><form id="delete-form"><button class="button danger" type="submit">Xác nhận xóa</button><a class="button secondary" href="/admin/${resource}">Giữ lại</a></form></section></div>`);
    pageSubmit = async (form) => {
      if (form.id !== 'delete-form') return;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await api.remove(resource, record.id);
        if (!alive(current)) return;
        dropAdmin(resource);
        await go(`/admin/${resource}`);
      } catch (error) {
        failView(current, error);
      }
    };
  } catch (error) {
    failView(current, error);
  }
}

function recipeHtml(data, values, errors, showAlert) {
  const dish = data.dish;
  const image = dish.image
    ? `<img src="${esc(dish.image)}" alt="${esc(dish.name)}">`
    : '<span aria-hidden="true">🍵</span>';
  const rows = data.recipe.length ? `<div class="relation-table-wrap"><table class="relation-table"><thead><tr><th>Nguyên liệu</th><th>Số lượng / phần</th><th></th></tr></thead><tbody>${data.recipe.map((line) => {
    const name = line.ingredient?.name || 'Nguyên liệu';
    const unit = line.ingredient?.unit || '';
    return `<tr><td>${esc(name)}</td><td>${esc(line.amount)}${esc(unit)}</td><td><a class="chip chip-edit" href="/admin/dishes/${encodeURIComponent(dish.id)}/ingredients/${encodeURIComponent(line.ingredientId)}/edit">Chỉnh sửa</a></td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="admin-count">Chưa gắn nguyên liệu nào. Số phần làm được = 0.</p>';
  const alert = showAlert ? '<div class="form-alert" role="alert">Vui lòng kiểm tra các trường bên dưới.</div>' : '';
  const ingredientField = pickerField({
    id: 'ingredientId',
    label: 'Nguyên liệu',
    required: true,
    placeholder: 'Tìm nguyên liệu theo tên',
    options: ingredientPickerOptions(data.availableIngredients),
    value: values.ingredientId,
    error: errors.ingredientId
  });
  const form = data.availableIngredients.length ? `<form id="recipe-form" class="form-card relation-form" novalidate>${alert}${ingredientField}<div class="field"><label for="field-amount">Lượng cần cho 1 phần *</label><input id="field-amount" name="amount" type="number" min="1" step="1" value="${esc(values.amount ?? '')}"${errors.amount ? ' aria-invalid="true"' : ''}>${errors.amount ? `<p class="field-error">${esc(errors.amount)}</p>` : ''}</div><div class="form-actions"><button class="button primary" type="submit">Thêm vào công thức</button></div></form>` : '<p class="admin-count">Mọi nguyên liệu đã được gắn, hoặc chưa có nguyên liệu nào trong kho.</p>';
  return `<div class="admin-content">${crumbs([{ href: '/admin/dishes', label: 'Món ăn' }, { label: 'Công thức' }])}<div class="admin-heading"><div><h1>${esc(dish.name)}</h1></div><div class="admin-actions"><a class="chip chip-edit" href="/admin/dishes/${encodeURIComponent(dish.id)}/edit">Sửa món</a><a class="button secondary" href="/admin/dishes">Quay lại</a></div></div><section class="recipe-summary"><div class="recipe-summary-image">${image}</div><div class="recipe-summary-copy"><p class="recipe-summary-description">${esc(dish.description || 'Chưa có mô tả cho món này.')}</p><p class="recipe-summary-servings">Có thể làm <strong>${esc(data.servings)}</strong> phần với nguyên liệu hiện tại</p></div></section><section class="relation-panel"><h2>Nguyên liệu trong công thức</h2>${rows}</section><section class="relation-panel"><h2>Thêm nguyên liệu</h2>${form}</section></div>`;
}

function paintRecipe(data, state) {
  show(`Công thức · ${data.dish.name}`, recipeHtml(data, state.values, state.errors, state.showAlert));
  pageSubmit = async (form) => {
    if (form.id !== 'recipe-form') return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const values = { ingredientId: form.elements.ingredientId.value, amount: form.elements.amount.value };
    try {
      await api.addIngredient(data.dish.id, {
        ingredientId: integerOrRaw(values.ingredientId),
        amount: integerOrRaw(values.amount)
      });
      if (!alive(state.token)) return;
      await go(`/admin/dishes/${data.dish.id}`);
    } catch (error) {
      if (!alive(state.token)) return;
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        paintRecipe(data, { token: state.token, values, errors: error.fields || {}, showAlert: true });
        return;
      }
      failView(state.token, error);
    }
  };
}

async function recipePage(groups, current) {
  showLoading('Công thức');
  try {
    const data = await api.getRecipe(groups[0]);
    if (!alive(current)) return;
    paintRecipe(data, { token: current, values: { ingredientId: '', amount: '' }, errors: {}, showAlert: false });
  } catch (error) {
    failView(current, error);
  }
}

async function recipeEditPage(groups, current) {
  const dishId = groups[0];
  const ingredientId = groups[1];
  showLoading('Sửa nguyên liệu');
  try {
    const data = await api.getRecipe(dishId);
    if (!alive(current)) return;
    const line = data.recipe.find((row) => String(row.ingredientId) === String(ingredientId));
    if (!line) {
      show('Không tìm thấy', viewNotFound());
      return;
    }
    const paint = (values, errors, showAlert) => {
      const name = line.ingredient?.name || 'Nguyên liệu';
      const unit = line.ingredient?.unit || '';
      show('Sửa nguyên liệu', `<div class="admin-content">${crumbs([{ href: '/admin/dishes', label: 'Món ăn' }, { href: `/admin/dishes/${encodeURIComponent(data.dish.id)}`, label: data.dish.name }, { label: 'Chỉnh sửa nguyên liệu' }])}<div class="form-layout"><div><h1>Chỉnh sửa nguyên liệu</h1><p><strong>${esc(name)}</strong> trong công thức món ${esc(data.dish.name)}.</p></div><div><form id="amount-form" class="form-card relation-form" novalidate>${showAlert ? '<div class="form-alert" role="alert">Vui lòng kiểm tra các trường bên dưới.</div>' : ''}<div class="field"><label for="field-amount">Số lượng / phần (${esc(unit)}) *</label><input id="field-amount" name="amount" type="number" min="1" step="1" value="${esc(values.amount ?? '')}"${errors.amount ? ' aria-invalid="true"' : ''}>${errors.amount ? `<p class="field-error">${esc(errors.amount)}</p>` : ''}</div><div class="form-actions"><button class="button primary" type="submit">Lưu số lượng</button><a class="button secondary" href="/admin/dishes/${encodeURIComponent(data.dish.id)}">Hủy</a></div></form><p class="admin-count">Hoặc gỡ nguyên liệu khỏi công thức:</p><a class="button danger" href="/admin/dishes/${encodeURIComponent(data.dish.id)}/ingredients/${encodeURIComponent(line.ingredientId)}/delete">Xóa khỏi công thức</a></div></div></div>`);
      pageSubmit = async (form) => {
        if (form.id !== 'amount-form') return;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        const nextValues = { amount: form.elements.amount.value };
        try {
          await api.updateIngredient(data.dish.id, line.ingredientId, { amount: integerOrRaw(nextValues.amount) });
          if (!alive(current)) return;
          await go(`/admin/dishes/${data.dish.id}`);
        } catch (error) {
          if (!alive(current)) return;
          if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
            paint(nextValues, error.fields || {}, true);
            return;
          }
          failView(current, error);
        }
      };
    };
    paint({ amount: String(line.amount) }, {}, false);
  } catch (error) {
    failView(current, error);
  }
}

async function recipeDeletePage(groups, current) {
  const dishId = groups[0];
  const ingredientId = groups[1];
  showLoading('Gỡ nguyên liệu');
  try {
    const data = await api.getRecipe(dishId);
    if (!alive(current)) return;
    const line = data.recipe.find((row) => String(row.ingredientId) === String(ingredientId));
    if (!line) {
      show('Không tìm thấy', viewNotFound());
      return;
    }
    const name = line.ingredient?.name || 'Nguyên liệu';
    const back = `/admin/dishes/${encodeURIComponent(data.dish.id)}/ingredients/${encodeURIComponent(line.ingredientId)}/edit`;
    show('Gỡ nguyên liệu', `<div class="admin-content">${crumbs([{ href: back, label: 'Chỉnh sửa' }, { label: 'Xác nhận gỡ' }])}<section class="confirm-card"><p class="danger-label">XÁC NHẬN THAO TÁC</p><h1>Gỡ nguyên liệu khỏi công thức?</h1><p>Bạn sắp gỡ “${esc(name)}” khỏi món “${esc(data.dish.name)}”. Chỉ khi bấm xác nhận bên dưới, liên kết mới bị xóa.</p><form id="unlink-form"><button class="button danger" type="submit">Xác nhận gỡ</button><a class="button secondary" href="${back}">Giữ lại</a></form></section></div>`);
    pageSubmit = async (form) => {
      if (form.id !== 'unlink-form') return;
      form.querySelector('button[type="submit"]').disabled = true;
      try {
        await api.removeIngredient(data.dish.id, line.ingredientId);
        if (!alive(current)) return;
        await go(`/admin/dishes/${data.dish.id}`);
      } catch (error) {
        failView(current, error);
      }
    };
  } catch (error) {
    failView(current, error);
  }
}

function chefHtml(data, values, errors, showAlert) {
  const chef = data.chef;
  const assigned = data.assigned.length ? `<div class="admin-list">${data.assigned.map((row) => {
    const dish = row.dish || {};
    const thumb = dish.image ? `<img src="${esc(dish.image)}" alt="">` : '<span aria-hidden="true">🍵</span>';
    return `<article class="admin-row"><div class="admin-thumb">${thumb}</div><div class="admin-row-copy"><h2>${esc(dish.name || 'Món')}</h2><p>${esc(categoryLabel(dish.category))} · ${esc(formatVND(dish.price))}</p></div><div class="admin-actions"><a class="chip chip-delete" href="/admin/chefs/${encodeURIComponent(chef.id)}/dishes/${encodeURIComponent(row.dishId)}/delete">Gỡ món</a></div></article>`;
  }).join('')}</div>` : '<p class="admin-count">Chưa gán món nào cho đầu bếp này.</p>';
  const alert = showAlert ? '<div class="form-alert" role="alert">Vui lòng kiểm tra các trường bên dưới.</div>' : '';
  const dishField = pickerField({
    id: 'dishId',
    label: 'Món ăn',
    required: true,
    placeholder: 'Tìm món theo tên',
    options: dishPickerOptions(data.availableDishes),
    value: values.dishId,
    error: errors.dishId
  });
  const form = data.availableDishes.length ? `<form id="assign-form" class="form-card relation-form" novalidate>${alert}${dishField}<div class="form-actions"><button class="button primary" type="submit">Gán món</button></div></form>` : '<p class="admin-count">Mọi món đã được gán, hoặc chưa có món nào.</p>';
  return `<div class="admin-content">${crumbs([{ href: '/admin/chefs', label: 'Đầu bếp' }, { label: 'Món có thể làm' }])}<div class="admin-heading"><div><h1>${esc(chef.name)}</h1><p>${esc(chef.specialty)} · ${data.assigned.length} món đã gán</p></div><div class="admin-actions"><a class="chip chip-edit" href="/admin/chefs/${encodeURIComponent(chef.id)}/edit">Sửa đầu bếp</a><a class="button secondary" href="/admin/chefs">Quay lại</a></div></div><section class="relation-panel"><h2>Món đầu bếp có thể làm</h2>${assigned}</section><section class="relation-panel"><h2>Thêm món</h2>${form}</section></div>`;
}

function paintChef(data, state) {
  show(`Món · ${data.chef.name}`, chefHtml(data, state.values, state.errors, state.showAlert));
  pageSubmit = async (form) => {
    if (form.id !== 'assign-form') return;
    form.querySelector('button[type="submit"]').disabled = true;
    const values = { dishId: form.elements.dishId.value };
    try {
      await api.addChefDish(data.chef.id, { dishId: integerOrRaw(values.dishId) });
      if (!alive(state.token)) return;
      await go(`/admin/chefs/${data.chef.id}`);
    } catch (error) {
      if (!alive(state.token)) return;
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        paintChef(data, { token: state.token, values, errors: error.fields || {}, showAlert: true });
        return;
      }
      failView(state.token, error);
    }
  };
}

async function chefPage(groups, current) {
  showLoading('Đầu bếp');
  try {
    const data = await api.getChefDishes(groups[0]);
    if (!alive(current)) return;
    paintChef(data, { token: current, values: { dishId: '' }, errors: {}, showAlert: false });
  } catch (error) {
    failView(current, error);
  }
}

async function chefDishDeletePage(groups, current) {
  const chefId = groups[0];
  const dishId = groups[1];
  showLoading('Gỡ món');
  try {
    const data = await api.getChefDishes(chefId);
    if (!alive(current)) return;
    const link = data.assigned.find((row) => String(row.dishId) === String(dishId));
    if (!link) {
      show('Không tìm thấy', viewNotFound());
      return;
    }
    const back = `/admin/chefs/${encodeURIComponent(data.chef.id)}`;
    show('Gỡ món', `<div class="admin-content">${crumbs([{ href: back, label: data.chef.name }, { label: 'Xác nhận gỡ' }])}<section class="confirm-card"><p class="danger-label">XÁC NHẬN THAO TÁC</p><h1>Gỡ món khỏi đầu bếp?</h1><p>Bạn sắp gỡ “${esc(link.dish?.name || 'Món')}” khỏi đầu bếp “${esc(data.chef.name)}”. Chỉ khi bấm xác nhận bên dưới, liên kết mới bị xóa.</p><form id="unlink-form"><button class="button danger" type="submit">Xác nhận gỡ</button><a class="button secondary" href="${back}">Giữ lại</a></form></section></div>`);
    pageSubmit = async (form) => {
      if (form.id !== 'unlink-form') return;
      form.querySelector('button[type="submit"]').disabled = true;
      try {
        await api.removeChefDish(data.chef.id, link.dishId);
        if (!alive(current)) return;
        await go(back);
      } catch (error) {
        failView(current, error);
      }
    };
  } catch (error) {
    failView(current, error);
  }
}

const routes = [
  [/^\/dishes$/, dishesPage],
  [/^\/dishes\/([^/]+)$/, dishPage],
  [/^\/admin\/(dishes|chefs|ingredients)$/, adminListPage],
  [/^\/admin\/(dishes|chefs|ingredients)\/new$/, adminCreatePage],
  [/^\/admin\/(dishes|chefs|ingredients)\/([^/]+)\/edit$/, adminEditPage],
  [/^\/admin\/(dishes|chefs|ingredients)\/([^/]+)\/delete$/, adminDeletePage],
  [/^\/admin\/dishes\/([^/]+)\/ingredients\/([^/]+)\/edit$/, recipeEditPage],
  [/^\/admin\/dishes\/([^/]+)\/ingredients\/([^/]+)\/delete$/, recipeDeletePage],
  [/^\/admin\/dishes\/([^/]+)$/, recipePage],
  [/^\/admin\/chefs\/([^/]+)\/dishes\/([^/]+)\/delete$/, chefDishDeletePage],
  [/^\/admin\/chefs\/([^/]+)$/, chefPage]
];

function matchRoute(pathname) {
  for (const [pattern, handler] of routes) {
    const match = pattern.exec(pathname);
    if (match) return { handler, groups: match.slice(1) };
  }
  return null;
}

function go(path, { replace = false } = {}) {
  const url = new URL(path, location.origin);
  const next = url.pathname + url.search;
  const current = location.pathname + location.search;
  if (next !== current) history[replace ? 'replaceState' : 'pushState'](null, '', next);
  return render();
}

async function render() {
  if (location.pathname === '/') history.replaceState(null, '', '/dishes');
  else if (location.pathname === '/admin') history.replaceState(null, '', '/admin/dishes');
  else if (location.pathname.length > 1 && location.pathname.endsWith('/')) {
    history.replaceState(null, '', location.pathname.replace(/\/+$/, '') + location.search);
  }
  const current = startView();
  const match = matchRoute(location.pathname);
  if (!match) {
    show('Không tìm thấy', viewNotFound());
    return;
  }
  await match.handler(match.groups, current);
}

let pickerQuietFocus = false;

function pickerRoot(node) {
  return node?.closest?.('[data-picker]') || null;
}

function visiblePickerOptions(picker) {
  return [...picker.querySelectorAll('[data-picker-option]')].filter((item) => !item.hidden);
}

function committedPickerOption(picker) {
  const value = picker.querySelector('input[type="hidden"]').value;
  if (!value) return null;
  return [...picker.querySelectorAll('[data-picker-option]')].find((item) => item.dataset.value === value) || null;
}

function paintPickerCurrent(picker, option) {
  const slot = picker.querySelector('.picker-current');
  slot.replaceChildren();
  if (!option) {
    slot.classList.add('is-empty');
    return;
  }
  slot.classList.remove('is-empty');
  const image = option.dataset.image || '';
  if (image) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = image;
    slot.appendChild(img);
    return;
  }
  slot.textContent = option.dataset.fallback || '';
}

function applyPickerFilter(picker) {
  const input = picker.querySelector('.picker-input');
  const query = input.dataset.filtering === 'true' ? input.value : '';
  let shown = 0;
  for (const option of picker.querySelectorAll('[data-picker-option]')) {
    const match = matchesPickerQuery(option.dataset.search || '', query);
    option.hidden = !match;
    if (!match) option.classList.remove('is-active');
    else shown += 1;
  }
  const total = picker.querySelectorAll('[data-picker-option]').length;
  const none = picker.querySelector('[data-empty="none"]');
  const miss = picker.querySelector('[data-empty="miss"]');
  if (none) none.hidden = total !== 0;
  if (miss) miss.hidden = total === 0 || shown !== 0;
  const active = picker.querySelector('.picker-option.is-active');
  if (!active || active.hidden) input.removeAttribute('aria-activedescendant');
}

function closePicker(picker) {
  const list = picker.querySelector('.picker-list');
  const input = picker.querySelector('.picker-input');
  if (!list || !input) return;
  list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  for (const item of picker.querySelectorAll('.picker-option.is-active')) item.classList.remove('is-active');
}

function restorePicker(picker) {
  const option = committedPickerOption(picker);
  const input = picker.querySelector('.picker-input');
  input.value = option ? option.dataset.label : '';
  input.dataset.filtering = 'false';
  paintPickerCurrent(picker, option);
  picker.classList.toggle('is-set', Boolean(option));
  applyPickerFilter(picker);
}

function openPicker(picker, { scrollSelected = false } = {}) {
  for (const other of document.querySelectorAll('[data-picker]')) {
    if (other !== picker) {
      restorePicker(other);
      closePicker(other);
    }
  }
  const list = picker.querySelector('.picker-list');
  const wasClosed = list.hidden;
  applyPickerFilter(picker);
  list.hidden = false;
  picker.querySelector('.picker-input').setAttribute('aria-expanded', 'true');
  const selected = picker.querySelector('[data-picker-option][aria-selected="true"]');
  if (scrollSelected && wasClosed && selected && !selected.hidden) selected.scrollIntoView({ block: 'nearest' });
}

function commitPickerOption(option) {
  const picker = option.closest('[data-picker]');
  const input = picker.querySelector('.picker-input');
  picker.querySelector('input[type="hidden"]').value = option.dataset.value || '';
  input.value = option.dataset.label || '';
  input.dataset.filtering = 'false';
  for (const item of picker.querySelectorAll('[data-picker-option]')) {
    item.setAttribute('aria-selected', item === option ? 'true' : 'false');
    item.classList.remove('is-active');
  }
  paintPickerCurrent(picker, option);
  picker.classList.add('is-set');
  applyPickerFilter(picker);
  closePicker(picker);
  pickerQuietFocus = true;
  input.focus();
  pickerQuietFocus = false;
}

function clearPicker(picker) {
  const input = picker.querySelector('.picker-input');
  picker.querySelector('input[type="hidden"]').value = '';
  input.value = '';
  input.dataset.filtering = 'false';
  for (const item of picker.querySelectorAll('[data-picker-option]')) {
    item.setAttribute('aria-selected', 'false');
  }
  paintPickerCurrent(picker, null);
  picker.classList.remove('is-set');
  openPicker(picker);
  input.focus();
}

function movePicker(picker, delta) {
  const options = visiblePickerOptions(picker);
  if (!options.length) return;
  const input = picker.querySelector('.picker-input');
  let index = options.findIndex((item) => item.classList.contains('is-active'));
  if (delta === 'first') index = 0;
  else if (delta === 'last') index = options.length - 1;
  else if (index === -1) {
    const selectedIndex = options.findIndex((item) => item.getAttribute('aria-selected') === 'true');
    index = delta > 0 && selectedIndex >= 0 ? selectedIndex : (delta > 0 ? 0 : options.length - 1);
  } else {
    index = (index + delta + options.length) % options.length;
  }
  for (const item of picker.querySelectorAll('[data-picker-option]')) {
    item.classList.toggle('is-active', item === options[index]);
  }
  input.setAttribute('aria-activedescendant', options[index].id);
  options[index].scrollIntoView({ block: 'nearest' });
}

document.addEventListener('pointerdown', (event) => {
  const option = event.target.closest?.('[data-picker-option]');
  if (option) {
    event.preventDefault();
    commitPickerOption(option);
    return;
  }
  const clear = event.target.closest?.('.picker-clear');
  if (clear) {
    event.preventDefault();
    clearPicker(pickerRoot(clear));
    return;
  }
  const toggle = event.target.closest?.('.picker-toggle');
  if (toggle) {
    event.preventDefault();
    const picker = pickerRoot(toggle);
    const list = picker.querySelector('.picker-list');
    if (list.hidden) {
      openPicker(picker, { scrollSelected: true });
      picker.querySelector('.picker-input').focus();
    } else {
      restorePicker(picker);
      closePicker(picker);
    }
    return;
  }
  if (event.target.closest?.('.picker-input')) {
    const picker = pickerRoot(event.target);
    if (picker.querySelector('.picker-list').hidden) openPicker(picker, { scrollSelected: true });
  }
});

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.classList.contains('picker-input')) return;
  const picker = pickerRoot(input);
  input.dataset.filtering = 'true';
  const committed = committedPickerOption(picker);
  if (!input.value.trim()) {
    picker.querySelector('input[type="hidden"]').value = '';
    for (const item of picker.querySelectorAll('[data-picker-option]')) item.setAttribute('aria-selected', 'false');
    paintPickerCurrent(picker, null);
    picker.classList.remove('is-set');
  } else if (!committed || input.value !== committed.dataset.label) {
    paintPickerCurrent(picker, null);
  } else {
    paintPickerCurrent(picker, committed);
  }
  openPicker(picker);
});

document.addEventListener('keydown', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.classList.contains('picker-input')) return;
  if (event.isComposing || event.key === 'Process') return;
  const picker = pickerRoot(input);
  const list = picker.querySelector('.picker-list');
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (list.hidden) openPicker(picker);
    movePicker(picker, event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if ((event.key === 'Home' || event.key === 'End') && !list.hidden) {
    event.preventDefault();
    movePicker(picker, event.key === 'Home' ? 'first' : 'last');
    return;
  }
  if (event.key === 'Escape' && !list.hidden) {
    event.preventDefault();
    restorePicker(picker);
    closePicker(picker);
    return;
  }
  if (event.key === 'Enter' && !list.hidden) {
    const visible = visiblePickerOptions(picker);
    const active = visible.find((item) => item.classList.contains('is-active'));
    const choice = active || (visible.length === 1 ? visible[0] : null);
    if (choice) {
      event.preventDefault();
      commitPickerOption(choice);
      return;
    }
    if (input.dataset.filtering === 'true') event.preventDefault();
  }
});

document.addEventListener('focusout', (event) => {
  const picker = pickerRoot(event.target);
  if (!picker) return;
  requestAnimationFrame(() => {
    if (!picker.isConnected || picker.contains(document.activeElement)) return;
    restorePicker(picker);
    closePicker(picker);
  });
});

document.addEventListener('focusin', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.classList.contains('picker-input')) return;
  if (pickerQuietFocus) return;
  if (input.dataset.filtering !== 'true') input.select();
  openPicker(pickerRoot(input), { scrollSelected: true });
});

document.addEventListener('click', (event) => {
  const retry = event.target.closest('[data-retry]');
  if (retry) {
    event.preventDefault();
    render();
    return;
  }
  const clear = event.target.closest('.picker-clear');
  if (clear) {
    event.preventDefault();
    clearPicker(pickerRoot(clear));
    return;
  }
  if (pickerRoot(event.target)) return;
  for (const picker of document.querySelectorAll('[data-picker]')) {
    restorePicker(picker);
    closePicker(picker);
  }
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, location.origin);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  go(url.pathname + url.search);
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.closest('#app')) return;
  event.preventDefault();
  if (pageSubmit) pageSubmit(form);
});

window.addEventListener('popstate', () => { render(); });
render();
