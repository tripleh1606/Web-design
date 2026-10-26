import { ApiError, requestDishPage } from './api.js';
import { el, link } from './dom.js';
import { createPageBuffer } from './page-buffer.js';

const VIEWS = [['pages', 'Số trang', '01'], ['more', 'Tải thêm', '02'], ['infinite', 'Cuộn liên tục', '03']];
const FILTER_KEYS = ['q', 'category', 'minPrice', 'maxPrice', 'available', 'sort'];
const SORTS = [['', 'Mặc định'], ['id-desc', 'Mới nhất'], ['name-asc', 'Tên A → Z'], ['name-desc', 'Tên Z → A'], ['price-asc', 'Giá tăng dần'], ['price-desc', 'Giá giảm dần']];

function menuUrl(base, changes = {}, { reset = false } = {}) {
  const params = new URLSearchParams(base.searchParams);
  for (const [key, value] of Object.entries(changes)) {
    if (value === '' || value === undefined || value === null) params.delete(key);
    else params.set(key, value);
  }
  if (reset) params.set('page', '1');
  if (params.get('view') && params.get('view') !== 'pages') params.delete('page');
  return '/dishes' + (params.size ? '?' + params.toString() : '');
}

function select(id, choices, value, onChange) {
  return el('select', { id, name: id.replace('menu-', ''), onChange }, choices.map(([key, label]) =>
    el('option', { value: key, selected: value === key }, label)));
}

function state(kind, title, text, ...actions) {
  return el('section', { className: `state ${kind}`, 'data-state': kind, role: kind === 'error' ? 'alert' : 'status' },
    el('h3', {}, title), el('p', {}, text), el('div', { className: 'actions' }, actions));
}

export async function renderMenu(ctx, url, { navigate, renderCard }) {
  document.title = 'Soucha · Thực đơn';
  const view = VIEWS.some(([key]) => key === url.searchParams.get('view')) ? url.searchParams.get('view') : 'pages';
  // Append views deliberately restart at page 1 on reload / Back / shared links.
  if (view !== 'pages' && url.searchParams.has('page')) {
    url.searchParams.delete('page');
    history.replaceState({}, '', url.pathname + url.search);
  }
  const pageSize = url.searchParams.get('pageSize') || '10';
  const initialPage = view === 'pages' ? url.searchParams.get('page') || '1' : '1';
  const applied = Object.fromEntries(FILTER_KEYS.map((key) => [key, url.searchParams.get(key) || '']));
  const search = el('input', { name: 'q', type: 'search', value: applied.q, maxLength: 120, placeholder: 'Bạn muốn uống gì hôm nay?', 'aria-label': 'Tìm món theo tên' });
  const resetUrl = menuUrl(new URL('/dishes', url), { view, pageSize });
  const submit = () => {
    const changes = { q: search.value.trim(), category: category.value, sort: sort.value,
      available: available.value, minPrice: minPrice.value, maxPrice: maxPrice.value };
    navigate(menuUrl(url, changes, { reset: true }));
  };
  const category = select('menu-category', [['', 'Tất cả danh mục'], ['coffee', 'Coffee'], ['matcha', 'Matcha'], ['houjicha', 'Houjicha']], applied.category, submit);
  const sort = select('menu-sort', SORTS, applied.sort, submit);
  const available = select('menu-available', [['', 'Tất cả trạng thái'], ['true', 'Đang phục vụ'], ['false', 'Tạm hết']], applied.available, submit);
  const minPrice = el('input', { id: 'menu-minPrice', name: 'minPrice', type: 'number', min: 0, max: 2147483647, step: 1, value: applied.minPrice, placeholder: 'Không giới hạn' });
  const maxPrice = el('input', { id: 'menu-maxPrice', name: 'maxPrice', type: 'number', min: 0, max: 2147483647, step: 1, value: applied.maxPrice, placeholder: 'Không giới hạn' });
  const sizeChoices = [...new Set(['10', '20', '50', '100', ...(/^\d+$/.test(pageSize) && Number(pageSize) >= 1 && Number(pageSize) <= 100 ? [pageSize] : [])])].sort((a, b) => Number(a) - Number(b));
  const sizeSelect = select('menu-pageSize', sizeChoices.map((size) => [size, `${size} món`]), pageSize,
    () => navigate(menuUrl(url, { pageSize: sizeSelect.value }, { reset: true })));
  const field = (id, label, input) => el('div', { className: 'menu-filter-field' }, el('label', { htmlFor: id }, label), input);
  const count = el('p', { className: 'result-count', role: 'status', 'aria-live': 'polite' }, 'Đang tìm món cho bạn…');
  const progress = el('span', { className: 'menu-progress-text' });
  const meter = el('progress', { className: 'menu-progress', max: 1, value: 0, 'aria-label': 'Số món đã xem trên tổng kết quả' });
  const resultHeader = el('div', { className: 'menu-result-heading' }, count, el('div', { className: 'menu-progress-wrap' }, progress, meter));
  const grid = el('div', { className: 'dish-grid', 'data-menu-grid': '' });
  const message = el('div', { className: 'menu-message' });
  const controls = el('div', { className: 'pagination-controls' });
  const sentinel = el('div', { className: 'pagination-sentinel', 'aria-hidden': 'true' });
  const result = el('div', { className: 'menu-results', 'data-pagination-view': view }, resultHeader, grid, message, sentinel, controls);
  const modeNav = el('nav', { className: 'pagination-modes', 'aria-label': 'Cách hiển thị danh sách' }, VIEWS.map(([key, label, number]) => {
    const anchor = link(menuUrl(url, { view: key }, { reset: true }), '', key === view ? 'active' : '');
    anchor.setAttribute('aria-current', key === view ? 'page' : 'false');
    anchor.dataset.view = key;
    anchor.append(el('span', { className: 'mode-number', 'aria-hidden': 'true' }, number), label);
    return anchor;
  }));
  const activeFilters = FILTER_KEYS.some((key) => applied[key]);
  const form = el('form', { className: 'menu-search-form', onSubmit: (event) => { event.preventDefault(); submit(); } },
    el('div', { className: 'search' }, search, el('button', { type: 'submit' }, 'Tìm món'), ...(activeFilters ? [link(resetUrl, 'Xóa bộ lọc', 'button secondary')] : [])),
    el('div', { className: 'menu-filters paginated-filters' }, field('menu-category', 'Danh mục', category),
      field('menu-available', 'Trạng thái', available), field('menu-sort', 'Sắp xếp', sort),
      field('menu-minPrice', 'Giá từ (đ)', minPrice), field('menu-maxPrice', 'Đến (đ)', maxPrice)));
  ctx.body.replaceChildren(el('section', { className: 'hero' },
    el('div', {}, el('span', { className: 'eyebrow' }, 'COFFEE · MATCHA · HOUJICHA'),
      el('h1', {}, 'Chậm một chút,', el('br'), el('em', {}, 'thưởng một ngụm trà.')),
      el('p', {}, 'Từ những lá trà được chọn lọc, Soucha gửi bạn một khoảng dịu dàng trong ngày.')),
    el('img', { src: '/logo.svg', alt: '', className: 'hero-mark' })),
    el('section', { className: 'menu-section' },
      el('div', { className: 'section-heading' }, el('h2', {}, 'Thực đơn nhà Soucha'), el('span', {}, 'Một lựa chọn, một chút bình yên')),
      form, el('div', { className: 'pagination-toolbar' }, modeNav, field('menu-pageSize', 'Mỗi lượt', sizeSelect)),
      el('p', { className: 'pagination-policy' }, view === 'pages'
        ? 'Chọn một trang để khám phá. Mở lại liên kết sẽ giữ đúng trang và bộ lọc của bạn.'
        : `${view === 'more' ? 'Bấm Tải thêm' : 'Cuộn gần cuối danh sách'} để khám phá tiếp. Mở lại liên kết sẽ tải từ đầu với cùng bộ lọc.`), result));

  let pending = false;
  let end = false;
  let nextPage = Number(initialPage);
  let metadata;
  let failed = false;
  let frame;
  const seen = new Set();
  let observer;
  const pageBuffer = createPageBuffer((page) => requestDishPage({ ...applied, page, pageSize, signal: ctx.signal }));
  const canPrefetch = view !== 'pages' && !navigator.connection?.saveData && !['slow-2g', '2g'].includes(navigator.connection?.effectiveType);
  const loadButton = el('button', { type: 'button', className: 'load-more-button', 'data-load-next': '', onClick: () => loadNext() });
  const endMessage = el('p', { className: 'pagination-end', role: 'status' }, 'Đã đến cuối danh sách. Cảm ơn bạn đã ghé Soucha.');
  const isActive = () => !ctx.signal.aborted;
  function cleanup() { observer?.disconnect(); cancelAnimationFrame(frame); pageBuffer.clear(); }
  ctx.signal.addEventListener('abort', cleanup, { once: true });

  function updateCount() {
    if (!metadata) return;
    const { total, page: current, pageSize: size } = metadata;
    const start = total && seen.size ? view === 'pages' ? (current - 1) * size + 1 : 1 : 0;
    const finish = total && seen.size ? view === 'pages' ? (current - 1) * size + seen.size : seen.size : 0;
    count.textContent = `${start}–${finish} / ${total} món${applied.q ? ` · “${applied.q}”` : ''}`;
    progress.textContent = total === 0 ? 'Không có kết quả' : view === 'pages' ? `Trang ${current} / ${Math.ceil(total / size)}` : `Đã khám phá ${seen.size} / ${total}`;
    meter.max = Math.max(total, 1);
    meter.value = view === 'pages' ? finish : seen.size;
  }

  function renderControls() {
    if (view === 'pages') {
      controls.replaceChildren();
      if (!metadata || metadata.total === 0) return;
      const current = metadata.page;
      const totalPages = Math.ceil(metadata.total / metadata.pageSize);
      const nav = el('nav', { className: 'numbered-pagination', 'aria-label': 'Phân trang món ăn' });
      const pageLink = (page, label, extra = {}) => {
        const anchor = link(menuUrl(url, { page, pageSize, view }), label, 'page-link');
        anchor.setAttribute('aria-label', `Trang ${page}`);
        for (const [key, value] of Object.entries(extra)) anchor.setAttribute(key, value);
        return anchor;
      };
      nav.append(current > 1 ? pageLink(current - 1, '←', { 'aria-label': 'Trang trước' }) : el('span', { className: 'page-link disabled', 'aria-disabled': 'true' }, '←'));
      const visible = new Set([1, totalPages]);
      const center = Math.min(current, totalPages);
      for (let page = Math.max(1, center - 2); page <= Math.min(totalPages, center + 2); page++) visible.add(page);
      let previous = 0;
      for (const page of [...visible].sort((a, b) => a - b)) {
        if (previous && page > previous + 1) nav.append(el('span', { className: 'page-ellipsis', 'aria-hidden': 'true' }, '…'));
        nav.append(pageLink(page, String(page), page === current ? { 'aria-current': 'page' } : {}));
        previous = page;
      }
      nav.append(current < totalPages ? pageLink(current + 1, '→', { 'aria-label': 'Trang tiếp' }) : el('span', { className: 'page-link disabled', 'aria-disabled': 'true' }, '→'));
      controls.append(nav);
    } else {
      if (metadata?.total === 0) { controls.replaceChildren(); return; }
      if (!loadButton.isConnected) controls.append(loadButton);
      loadButton.disabled = pending || end;
      loadButton.textContent = pending ? 'Đang tải…' : failed ? 'Thử tải lại' : end ? 'Bạn đã xem hết thực đơn' : 'Tải thêm món ↓';
      if (end && !endMessage.isConnected) controls.append(endMessage);
    }
  }

  function checkSentinel() {
    if (view !== 'infinite' || pending || end || failed || !isActive()) return;
    const bounds = sentinel.getBoundingClientRect();
    if (bounds.top <= window.innerHeight + 200 && bounds.bottom >= -200) loadNext();
  }
  if (view === 'infinite' && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) checkSentinel();
    }, { rootMargin: '200px 0px' });
  }

  async function loadNext() {
    if (pending || end || !isActive()) return;
    pending = true;
    failed = false;
    message.replaceChildren();
    grid.setAttribute('aria-busy', 'true');
    if (!seen.size) message.append(state('loading', 'Đang tải thực đơn…', 'Những hương vị đang chờ bạn.'));
    renderControls();
    const requestedPage = metadata ? nextPage : initialPage;
    try {
      const data = await pageBuffer.take(Number(requestedPage));
      if (!isActive()) return;
      if (data.page !== Number(requestedPage) || data.pageSize !== Number(pageSize)) throw new ApiError('technical', 'Trang dữ liệu trả về không khớp yêu cầu. Vui lòng thử lại.');
      metadata = data;
      const fragment = document.createDocumentFragment();
      for (const record of data.items) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        const card = renderCard(record);
        card.dataset.dishId = record.id;
        fragment.append(card);
      }
      grid.append(fragment);
      end = data.items.length === 0 || data.page * data.pageSize >= data.total;
      nextPage = data.page + 1;
      if (canPrefetch && !end) pageBuffer.warm(nextPage);
      message.replaceChildren();
      if (!data.items.length && !seen.size) message.append(state('empty', data.total ? 'Trang này chưa có món' : 'Chưa có món phù hợp',
        data.total ? 'Trang bạn mở nằm ngoài danh sách hiện tại. Hãy quay lại trang đầu.' : 'Thử từ khóa khác hoặc xóa điều kiện tìm kiếm.',
        link(data.total ? menuUrl(url, { page: 1 }) : resetUrl, data.total ? 'Về trang đầu' : 'Xem tất cả', 'button secondary')));
      updateCount();
    } catch (error) {
      if (error.name === 'AbortError' || !isActive()) return;
      failed = true;
      if (!metadata) count.textContent = 'Chưa tải được thực đơn';
      const details = error.kind === 'business' ? Object.values(error.fields).join(' ') || error.message : error.message;
      message.replaceChildren(state('error', seen.size ? 'Chưa tải được phần tiếp theo' : 'Không thể tải dữ liệu', details,
        ...(view === 'pages' ? [el('button', { type: 'button', onClick: loadNext }, 'Thử lại')] : [])));
    } finally {
      pending = false;
      if (isActive()) {
        grid.setAttribute('aria-busy', 'false');
        renderControls();
        if (end || failed) observer?.unobserve(sentinel);
        else if (metadata && view === 'infinite') {
          observer?.observe(sentinel);
          frame = requestAnimationFrame(checkSentinel);
        }
      }
    }
  }
  return loadNext();
}
