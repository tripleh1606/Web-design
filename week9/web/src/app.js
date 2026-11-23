import { api } from './api/client.js';
import { StampPhoto } from './components/StampPhoto.js';

const main = document.querySelector('main');
let current;
let mutation = false;
let announcement = '';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function link(text, href, className = '') {
  const node = el('a', className, text); node.href = href; return node;
}
function button(text, handler, className = 'button') {
  const node = el('button', className, text); node.type = 'button';
  node.addEventListener('click', handler); return node;
}
function notice(message, kind = '') {
  const node = el('p', `notice ${kind}`, message); node.setAttribute('role', kind === 'error' ? 'alert' : 'status'); return node;
}
function heading(eyebrow, title, description) {
  const header = el('section', 'page-heading');
  header.append(el('p', 'eyebrow', eyebrow), el('h1', '', title), el('p', 'intro', description));
  return header;
}
function errorPanel(error, retry) {
  const box = el('section', 'state-panel');
  box.append(el('span', 'state-symbol', '↗'), el('h2', '', error.status === 404 ? 'Không tìm thấy bức ảnh' : 'Chưa thể tải nội dung'), notice(error.message, 'error'));
  if (retry) box.append(button('Thử kết nối lại', retry, 'button secondary'));
  return box;
}
const active = ctx => current === ctx && !ctx.signal.aborted;
function navigate(url) {
  if (mutation) { window.alert('Thao tác đang được gửi. Vui lòng chờ kết quả trước khi chuyển trang.'); return; }
  history.pushState(null, '', url); render(true);
}
function photoPath(id) { return `/photos/${encodeURIComponent(id)}`; }
function sharing(photo) {
  const section = el('section', 'share-panel');
  const url = new URL(photoPath(photo.id), location.origin).href;
  const label = el('label', '', 'Đường dẫn công khai');
  const input = el('input'); input.type = 'text'; input.readOnly = true; input.value = url;
  input.addEventListener('focus', () => input.select()); label.append(input);
  const status = notice('Ai có đường dẫn đều có thể xem ảnh.');
  section.append(label, button('Sao chép đường dẫn ↗', async () => {
    try { await navigator.clipboard.writeText(url); status.textContent = 'Đã sao chép đường dẫn.'; }
    catch { input.focus(); input.select(); status.textContent = 'Hãy sao chép đường dẫn trong ô bên trên.'; }
  }, 'button secondary'), status);
  return section;
}

async function gallery(ctx) {
  document.title = 'Bộ sưu tập — POSTAGE';
  const hero = heading('COLLECT MOMENTS, NOT THINGS', 'Những khung hình\nđáng giữ.', 'Một nơi nhỏ cho những chuyến đi, những ngày bình thường và những điều bạn muốn nhớ lâu hơn.');
  hero.classList.add('hero');
  const seal = el('div', 'postmark'); seal.setAttribute('aria-hidden', 'true'); seal.append(el('span', '', 'POSTAGE'), el('strong', '', '09'), el('span', '', 'MEMORIES IN FRAME'));
  hero.append(seal);
  const bar = el('div', 'collection-bar'); bar.append(el('h2', '', 'Bộ sưu tập'), el('span', 'muted', 'Ảnh thật. Kỷ niệm thật.'));
  const content = el('section'); content.setAttribute('aria-label', 'Danh sách ảnh'); content.append(notice('Đang mở bộ sưu tập…'));
  main.append(hero, bar, content);
  const pageValue = new URLSearchParams(location.search).get('page');
  const page = /^[1-9]\d*$/.test(pageValue || '') && Number.isSafeInteger(Number(pageValue)) ? Number(pageValue) : 1;
  try {
    const data = await api.list(page, ctx.signal);
    if (!active(ctx)) return;
    content.replaceChildren();
    bar.lastChild.textContent = `${data.total} bức ảnh · Trang ${page}`;
    if (!data.items.length) {
      const empty = el('div', 'state-panel');
      empty.append(el('span', 'state-symbol', '✳'), el('h2', '', page > 1 ? 'Trang này chưa có ảnh' : 'Kỷ niệm đầu tiên bắt đầu từ bạn'), el('p', 'muted', 'Những bức ảnh được công bố sẽ xuất hiện tại đây.'), link(page > 1 ? 'Về trang đầu' : 'Đến trang quản lý ↗', page > 1 ? '/' : '/manage', 'button secondary'));
      content.append(empty);
    } else {
      const grid = el('div', 'photo-grid');
      for (const photo of data.items) {
        const card = el('article', 'photo-card');
        const anchor = link('', photoPath(photo.id), 'photo-link');
        anchor.setAttribute('aria-label', `Xem ảnh: ${photo.title}`);
        anchor.append(StampPhoto(photo, { sizes: '(max-width: 639px) calc(100vw - 80px), (max-width: 959px) calc((100vw - 120px) / 2), (max-width: 1255px) calc((100vw - 160px) / 3), 365px' }));
        const caption = el('div', 'photo-caption');
        caption.append(link(photo.title, photoPath(photo.id)), el('span', '', '↗'));
        card.append(anchor, caption); grid.append(card);
      }
      content.append(grid);
    }
    const pages = Math.max(1, Math.ceil(data.total / data.limit));
    if (pages > 1 || page > 1) {
      const nav = el('nav', 'pagination'); nav.setAttribute('aria-label', 'Phân trang');
      if (page > 1) nav.append(link('← Trang trước', `/?page=${page - 1}`, 'button secondary'));
      nav.append(el('span', 'muted', `Trang ${page} / ${pages}`));
      if (page < pages) nav.append(link('Trang sau →', `/?page=${page + 1}`, 'button secondary'));
      content.append(nav);
    }
  } catch (error) { if (active(ctx)) content.replaceChildren(errorPanel(error, () => render())); }
}

async function detail(ctx, id) {
  document.title = 'Chi tiết ảnh — POSTAGE';
  main.append(link('← Về bộ sưu tập', '/', 'back-link'));
  const area = el('section'); area.append(notice('Đang tải bức ảnh…')); main.append(area);
  try {
    const photo = await api.photo(id, ctx.signal);
    if (!active(ctx)) return;
    document.title = `${photo.title} — POSTAGE`;
    area.replaceChildren(heading('A MOMENT TO KEEP', photo.title, photo.alt));
    const frame = el('div', 'detail-frame');
    frame.append(StampPhoto(photo, { sizes: '(max-width: 900px) calc(100vw - 80px), 812px', loading: 'eager' }));
    area.append(frame, sharing(photo));
    const controls = el('div', 'detail-actions'); area.append(controls);
    // Session discovery failure must not hide an otherwise viewable public photo.
    try {
      if (await api.session(ctx.signal) && active(ctx)) controls.append(button('Xóa ảnh', () => confirmDelete(photo, ctx), 'button danger'));
    } catch (error) { if (error.name === 'AbortError') return; }
  } catch (error) { if (active(ctx)) area.replaceChildren(errorPanel(error, () => render())); }
}

function confirmDelete(photo, ctx) {
  const dialog = el('dialog', 'confirm-dialog');
  dialog.setAttribute('aria-labelledby', 'delete-title');
  const title = el('h2', '', 'Xóa bức ảnh này?'); title.id = 'delete-title';
  const status = notice('Ảnh sẽ bị ẩn khỏi Gallery. Bản đã tải xuống hoặc được cache có thể vẫn còn.');
  const actions = el('div', 'actions');
  const cancel = button('Giữ lại', () => dialog.close(), 'button secondary');
  const submit = button('Xóa ảnh', async () => {
    mutation = true; submit.disabled = true; cancel.disabled = true;
    try {
      const result = await api.remove(photo.id);
      announcement = result.cleanup === 'pending' ? 'Ảnh đã được ẩn. Máy chủ đang tiếp tục dọn file.' : 'Đã xóa ảnh và dọn file liên quan.';
      dialog.close(); mutation = false; navigate('/');
    } catch (error) { status.textContent = `${error.message} Không tự động gửi lại thao tác xóa.`; status.setAttribute('role', 'alert'); }
    finally { mutation = false; submit.disabled = false; cancel.disabled = false; }
  }, 'button danger');
  actions.append(cancel, submit); dialog.append(title, status, actions);
  dialog.addEventListener('cancel', event => { if (mutation) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  ctx.cleanup.push(() => dialog.remove()); main.append(dialog); dialog.showModal(); cancel.focus();
}

async function manage(ctx) {
  document.title = 'Quản lý — POSTAGE';
  main.append(heading('THE OTHER SIDE OF THE POSTCARD', 'Gửi thêm một kỷ niệm.', 'Tải ảnh lên, viết một dòng mô tả và giữ lại những khoảnh khắc của bạn.'));
  const area = el('section', 'manage-area'); area.append(notice('Đang kiểm tra phiên quản lý…')); main.append(area);
  try {
    const authenticated = await api.session(ctx.signal);
    if (!active(ctx)) return;
    area.replaceChildren();
    if (!authenticated) loginForm(area, ctx);
    else uploadForm(area, ctx);
  } catch (error) { if (active(ctx)) area.replaceChildren(errorPanel(error, () => render())); }
}
function loginForm(area, ctx) {
  const form = el('form', 'login-form panel');
  form.append(el('h2', '', 'Quyền quản lý'), el('p', 'muted', 'Nhập mã quản lý được cấp. Link chia sẻ ảnh không cấp quyền tải lên hoặc xóa.'));
  const label = el('label', '', 'Mã quản lý');
  const input = el('input'); input.type = 'password'; input.required = true; input.autocomplete = 'current-password'; input.name = 'capability'; label.append(input);
  const submit = el('button', 'button', 'Mở trang quản lý ↗'); submit.type = 'submit';
  const status = notice('Mã không được lưu vào trình duyệt hoặc đường dẫn.');
  form.append(label, submit, status); area.append(form);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (mutation) return;
    mutation = true; submit.disabled = true;
    const capability = input.value; input.value = '';
    try { await api.login(capability); if (active(ctx)) { area.replaceChildren(); uploadForm(area, ctx); } }
    catch (error) { if (active(ctx)) { status.textContent = error.message; status.setAttribute('role', 'alert'); input.focus(); } }
    finally { mutation = false; submit.disabled = false; }
  });
}

function uploadForm(area, ctx) {
  const top = el('div', 'manager-bar'); top.append(notice('Phiên quản lý đang hoạt động'), button('Đăng xuất', async event => {
    if (mutation) return;
    mutation = true; event.currentTarget.disabled = true;
    try { await api.logout(); announcement = 'Đã đăng xuất.'; }
    catch (error) { announcement = `Không xác nhận được đăng xuất: ${error.message}`; }
    finally { mutation = false; if (active(ctx)) render(); }
  }, 'button secondary'));
  const form = el('form', 'upload-form');
  const drop = el('label', 'drop-zone');
  const picker = el('input'); picker.type = 'file'; picker.accept = 'image/jpeg,image/png'; picker.multiple = true; picker.name = 'photos';
  drop.append(el('span', 'upload-icon', '↑'), el('strong', '', 'Chọn những khung hình của bạn'), el('span', '', 'JPEG hoặc PNG · 1–5 ảnh · Tối đa 10 MiB mỗi ảnh'), picker);
  const selection = el('div', 'upload-selection');
  const status = notice('Ảnh sẽ được chuẩn hóa hướng và bỏ EXIF/GPS trên máy chủ.');
  const results = el('section', 'upload-results'); results.setAttribute('aria-label', 'Kết quả tải ảnh'); results.setAttribute('aria-live', 'polite');
  const submit = el('button', 'button', 'Công bố ảnh ↗'); submit.type = 'submit'; submit.disabled = true;
  const actions = el('div', 'actions'); actions.append(submit);
  form.append(drop, selection, status, actions, results); area.append(top, form);
  let entries = [];
  let epoch = 0;
  const clear = () => { for (const entry of entries) URL.revokeObjectURL(entry.url); entries = []; };
  ctx.cleanup.push(clear);
  picker.addEventListener('change', () => {
    epoch++; const generation = epoch;
    clear(); selection.replaceChildren(); results.replaceChildren(); submit.disabled = true;
    const files = [...picker.files];
    const invalid = files.length < 1 || files.length > 5 || files.some(file => file.size > 10 * 1024 ** 2 || !['image/jpeg', 'image/png'].includes(file.type));
    if (invalid) { status.textContent = 'Chọn 1–5 file JPEG/PNG, mỗi file tối đa 10 MiB. Máy chủ sẽ kiểm tra nội dung thực tế.'; status.setAttribute('role', 'alert'); picker.value = ''; return; }
    status.setAttribute('role', 'status'); status.textContent = 'Đang đọc kích thước ảnh…';
    entries = files.map(file => ({ file, url: URL.createObjectURL(file), valid: false }));
    for (const [index, entry] of entries.entries()) {
      const row = el('article', 'upload-row');
      const preview = el('div', 'upload-preview');
      const metadata = el('div', 'upload-metadata');
      const title = el('input'); title.type = 'text'; title.required = true; title.maxLength = 160; title.name = `title-${index}`;
      const alt = el('textarea'); alt.required = true; alt.maxLength = 1000; alt.name = `alt-${index}`; alt.rows = 2;
      const titleLabel = el('label', '', `Tiêu đề ảnh ${index + 1}`); titleLabel.append(title);
      const altLabel = el('label', '', 'Mô tả nội dung (alt text)'); altLabel.append(alt);
      metadata.append(el('p', 'file-name', `${index + 1}. ${entry.file.name} · ${(entry.file.size / 1024 ** 2).toFixed(2)} MiB`), titleLabel, altLabel);
      entry.title = title; entry.alt = alt; row.append(preview, metadata); selection.append(row);
      const image = new Image();
      image.onload = () => {
        if (!active(ctx) || generation !== epoch) return;
        entry.valid = image.naturalWidth * image.naturalHeight <= 40000000;
        if (entry.valid) preview.append(StampPhoto({ url: entry.url, width: image.naturalWidth, height: image.naturalHeight, alt: `Xem trước ảnh ${index + 1}` }, { sizes: '150px', loading: 'eager' }));
        else preview.append(notice('Ảnh vượt 40 triệu pixel.', 'error'));
        entry.ready = true; updateReady();
      };
      image.onerror = () => { if (active(ctx) && generation === epoch) { entry.ready = true; preview.append(notice('Không đọc được ảnh.', 'error')); updateReady(); } };
      image.src = entry.url;
    }
  });
  function updateReady() {
    const ready = entries.length > 0 && entries.every(entry => entry.ready);
    submit.disabled = !ready || entries.some(entry => !entry.valid);
    status.textContent = !ready ? 'Đang đọc kích thước ảnh…' : submit.disabled ? 'Có ảnh không hợp lệ. Hãy chọn lại bộ ảnh.' : 'Điền tiêu đề và alt text cho từng ảnh trước khi công bố.';
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (mutation || !entries.length || entries.some(entry => !entry.valid)) return;
    if (entries.some(entry => !entry.title.value.trim() || !entry.alt.value.trim())) { status.textContent = 'Tiêu đề và alt text không được chỉ chứa khoảng trắng.'; status.setAttribute('role', 'alert'); return; }
    mutation = true; submit.disabled = true; picker.disabled = true;
    for (const input of form.querySelectorAll('input,textarea')) input.disabled = true;
    status.textContent = 'Đang tải và xử lý ảnh. Vui lòng giữ trang mở…'; results.replaceChildren();
    try {
      const rows = await api.upload(entries.map(entry => entry.file), entries.map(entry => ({ title: entry.title.value.trim(), alt: entry.alt.value.trim() })));
      if (!active(ctx)) { announcement = 'Upload đã có kết quả. Kiểm tra Gallery trước khi gửi lại.'; return; }
      for (const result of rows) {
        const row = el('div', `result-row ${result.ok ? 'success' : 'error'}`);
        row.append(el('strong', '', `${result.index + 1}. ${entries[result.index].file.name}`));
        if (result.ok) row.append(link('Đã công bố — xem ảnh ↗', photoPath(result.photo.id)));
        else row.append(el('p', '', result.error.message));
        results.append(row);
      }
      status.textContent = `${rows.filter(row => row.ok).length}/${rows.length} ảnh được công bố. Chọn lại chỉ những file cần gửi tiếp để tránh trùng ảnh.`;
    } catch (error) { if (active(ctx)) { status.textContent = `${error.message} Không tự động thử lại. Kiểm tra Gallery trước khi gửi lại vì máy chủ có thể đã nhận ảnh.`; status.setAttribute('role', 'alert'); } }
    finally {
      mutation = false;
      if (active(ctx)) {
        clear(); epoch++; picker.value = ''; picker.disabled = false; selection.replaceChildren();
        submit.disabled = true;
      }
    }
  });
}

function render(focus = false) {
  if (current) { current.controller.abort(); for (const cleanup of current.cleanup) cleanup(); }
  const controller = new AbortController();
  const ctx = { controller, signal: controller.signal, cleanup: [] }; current = ctx;
  main.replaceChildren();
  if (announcement) { main.append(notice(announcement)); announcement = ''; }
  const path = location.pathname;
  document.querySelectorAll('[data-nav]').forEach(anchor => {
    if ((anchor.dataset.nav === 'manage' && path === '/manage') || (anchor.dataset.nav === 'gallery' && path !== '/manage')) anchor.setAttribute('aria-current', 'page');
    else anchor.removeAttribute('aria-current');
  });
  if (path === '/') gallery(ctx);
  else if (path === '/manage') manage(ctx);
  else if (/^\/photos\/[^/]+$/.test(path)) {
    try { detail(ctx, decodeURIComponent(path.slice(8))); }
    catch { main.append(errorPanel({ status: 404, message: 'Đường dẫn ảnh không hợp lệ.' })); }
  } else main.append(errorPanel({ status: 404, message: 'Trang này không tồn tại.' }), link('Về bộ sưu tập', '/', 'button'));
  if (focus) { main.focus(); window.scrollTo(0, 0); }
}
document.addEventListener('click', event => {
  const anchor = event.target.closest('a');
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target || anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href);
  if (url.origin !== location.origin || url.hash || !(/^\/(?:manage)?$/.test(url.pathname) || /^\/photos\/[^/]+$/.test(url.pathname))) return;
  event.preventDefault(); navigate(url.pathname + url.search);
});
window.addEventListener('popstate', () => render(true));
window.addEventListener('beforeunload', event => { if (mutation) { event.preventDefault(); event.returnValue = ''; } });
render();
