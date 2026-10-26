import { request } from './api.js';
import { resources, money, categoryLabel, validateForm } from './resources.js';
import { el, link, dishImage } from './dom.js';
import { createRecipeEditor } from './recipe-editor.js';
import { recipePage, chefPage, ingredientForm, unlinkPage } from './relations.js';
import { renderMenu } from './menu-pagination.js';

const main = document.querySelector('main');
// Only routing lifecycle is shared. Records and lists belong to each page closure.
let currentController;
function navigate(href, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState']({}, '', href);
  renderRoute();
}
document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[data-link]');
  if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target || anchor.hasAttribute('download')) return;
  const url = new URL(anchor.href);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});
window.addEventListener('popstate', renderRoute);

function panel(kind, title, text, ...actions) {
  return el('section', { className: `state ${kind}`, role: kind === 'error' ? 'alert' : 'status', 'data-state': kind },
    el('span', { className: 'eyebrow' }, kind === 'loading' ? 'ĐỢI MỘT CHÚT' : 'SOUCHA'),
    el('h2', {}, title), el('p', {}, text), el('div', { className: 'actions' }, actions));
}
function errorPanel(error, ctx, back = '/dishes') {
  if (error.name === 'AbortError' || ctx.signal.aborted) return;
  if (error.kind === 'business' && error.code === 'NOT_FOUND') {
    ctx.body.replaceChildren(panel('notFound', 'Không tìm thấy bản ghi', 'Bản ghi không tồn tại hoặc đã được xóa.', link(back, 'Quay lại danh sách', 'button')));
  } else {
    ctx.body.replaceChildren(panel('error', 'Không thể tải dữ liệu', error.kind === 'technical' ? error.message : 'Không thể thực hiện yêu cầu. Vui lòng thử lại.',
      el('button', { type: 'button', onClick: renderRoute }, 'Thử lại'), link(back, 'Quay lại danh sách', 'button secondary')));
  }
}
function adminTabs(resource) {
  return el('nav', { className: 'admin-tabs', 'aria-label': 'Tài nguyên quản trị' },
    Object.entries(resources).map(([key, config]) => link(`/admin/${key}`, config.label, resource === key ? 'active' : '')));
}
function pageHeader(title, subtitle, action) {
  return el('div', { className: 'page-heading' }, el('div', {}, el('span', { className: 'eyebrow' }, 'SOUCHA / QUẢN TRỊ'), el('h1', {}, title), el('p', {}, subtitle)), action);
}
function createContext(adminResource) {
  const controller = new AbortController();
  currentController = controller;
  const body = el('div', { className: 'page-body' });
  main.replaceChildren(...(adminResource ? [adminTabs(adminResource)] : []), body);
  main.focus({ preventScroll: true });
  return { signal: controller.signal, body };
}
function loading(ctx) { ctx.body.replaceChildren(panel('loading', 'Đang tải dữ liệu…', 'Soucha đang chuẩn bị nội dung cho bạn.')); }

async function dishList(ctx, url) {
  return renderMenu(ctx, url, { navigate, renderCard: linkCard });
}
function linkCard(record) {
  return el('article', { className: 'dish-card' }, linkImage(record),
    el('div', { className: 'dish-card-body' }, el('div', { className: 'card-meta' }, el('span', {}, categoryLabel(record.category)),
      el('span', { className: record.available ? 'availability' : 'availability off' }, record.available ? 'Đang phục vụ' : 'Tạm hết')),
      el('h3', {}, link(`/dishes/${record.id}`, record.name)),
      el('div', { className: 'card-bottom' }, el('strong', {}, money(record.price)), link(`/dishes/${record.id}`, 'Khám phá ↗', 'detail-link'))));
}
function linkImage(record) {
  const anchor = link(`/dishes/${record.id}`, '', 'dish-image-link');
  anchor.append(dishImage(record));
  anchor.setAttribute('aria-label', `Xem ${record.name}`);
  return anchor;
}
async function dishDetail(ctx, id) {
  loading(ctx);
  try {
    const record = await request('dishes', { id, signal: ctx.signal });
    if (ctx.signal.aborted) return;
    document.title = `Soucha · ${record.name}`;
    ctx.body.replaceChildren(link('/dishes', '← Quay lại thực đơn', 'back'),
      el('article', { className: 'dish-detail' }, dishImage(record, 'detail-image'),
        el('div', { className: 'detail-copy' }, el('span', { className: 'eyebrow' }, categoryLabel(record.category)),
          el('h1', {}, record.name), el('p', { className: 'detail-price' }, money(record.price)),
          el('p', { className: 'description' }, record.description || 'Chưa có mô tả cho món này.'),
          el('p', { className: 'recipe-preview' }, `Có thể làm ${record.servings} phần với nguyên liệu hiện tại.`),
          el('section', { className: 'public-recipe' }, el('h2', {}, 'Nguyên liệu cho một phần'),
            record.ingredients.length ? el('ul', {}, record.ingredients.map((line) => el('li', {}, `${line.ingredient.name}: ${line.amount} ${line.ingredient.unit}`))) : el('p', { className: 'muted' }, 'Chưa có công thức.')),
          el('dl', { className: 'facts' },
            el('dt', {}, 'Mã món'), el('dd', {}, String(record.id)),
            el('dt', {}, 'Tên món'), el('dd', {}, record.name),
            el('dt', {}, 'Giá'), el('dd', {}, money(record.price)),
            el('dt', {}, 'Danh mục'), el('dd', {}, categoryLabel(record.category)),
            el('dt', {}, 'Phục vụ'), el('dd', {}, record.available ? 'Đang phục vụ' : 'Tạm hết'),
            el('dt', {}, 'Đường dẫn ảnh'), el('dd', {}, record.image || 'Chưa có'),
            el('dt', {}, 'Ngày tạo'), el('dd', {}, new Date(record.createdAt).toLocaleString('vi-VN'))),
          el('div', { className: 'actions' }, link(`/admin/dishes/${record.id}/edit`, 'Chỉnh sửa món', 'button secondary'), link(`/admin/dishes/${record.id}`, 'Công thức & nguyên liệu', 'button secondary')))));
  } catch (error) { errorPanel(error, ctx); }
}

async function adminList(ctx, resource) {
  const config = resources[resource];
  const base = `/admin/${resource}`;
  document.title = `Soucha · Quản trị ${config.singular}`;
  loading(ctx);
  try {
    const rows = await request(resource, { signal: ctx.signal });
    if (ctx.signal.aborted) return;
    const heading = pageHeader(config.label, `${rows.length} bản ghi · Quản lý thông tin tại đây`, link(`${base}/new`, `+ Thêm ${config.singular}`, 'button'));
    if (!rows.length) return ctx.body.replaceChildren(heading, panel('empty', 'Danh sách đang trống', `Bắt đầu bằng cách thêm ${config.singular} đầu tiên.`));
    ctx.body.replaceChildren(heading, el('div', { className: 'admin-list' }, rows.map((row) => {
      const detail = resource === 'dishes' ? `${categoryLabel(row.category)} · ${money(row.price)} · ${row.available ? 'Đang phục vụ' : 'Tạm hết'}` :
        resource === 'chefs' ? row.specialty : `${row.stock} ${row.unit}`;
      return el('article', { className: 'admin-row' },
        resource === 'dishes' ? dishImage(row, 'admin-thumb') : el('span', { className: 'row-icon', 'aria-hidden': 'true' }, resource === 'chefs' ? '♧' : '❋'),
        el('div', { className: 'row-copy' }, el('h2', {}, resource === 'ingredients' ? row.name : link(`${base}/${row.id}`, row.name)), el('p', {}, detail), el('small', {}, `ID ${row.id}`)),
        el('div', { className: 'actions' }, ...(resource === 'dishes' ? [link(`/dishes/${row.id}`, 'Xem', 'button secondary')] : []),
          ...(resource !== 'ingredients' ? [link(`${base}/${row.id}`, resource === 'dishes' ? 'Công thức' : 'Món phụ trách', 'button secondary')] : []),
          link(`${base}/${row.id}/edit`, 'Sửa', 'button secondary'), link(`${base}/${row.id}/delete`, 'Xóa', 'button danger-outline')));
    })));
  } catch (error) { errorPanel(error, ctx, base); }
}

async function recordForm(ctx, resource, id) {
  const config = resources[resource];
  const base = `/admin/${resource}`;
  let record;
  let ingredients = [];
  document.title = `Soucha · ${id ? 'Sửa' : 'Thêm'} ${config.singular}`;
  if (id || resource === 'dishes') {
    loading(ctx);
    try {
      [record, ingredients] = await Promise.all([
        id ? request(resource, { id, signal: ctx.signal }) : undefined,
        resource === 'dishes' ? request('ingredients', { signal: ctx.signal }) : []
      ]);
    }
    catch (error) { return errorPanel(error, ctx, base); }
    if (ctx.signal.aborted) return;
  }
  const values = Object.fromEntries(config.fields.map((field) => [field.key,
    record?.[field.key] ?? (field.type === 'checkbox' ? true : field.key === 'stock' ? '0' : '')]));
  const inputs = {};
  const fieldErrors = {};
  const recipe = resource === 'dishes' ? createRecipeEditor({ ingredients, initial: record?.ingredients || [] }) : undefined;
  let submitting = false;
  const general = el('div', { className: 'form-message', role: 'alert' });
  const fieldset = el('fieldset');
  const save = el('button', { type: 'submit' }, id ? 'Lưu thay đổi' : `Thêm ${config.singular}`);
  const showErrors = (errors) => {
    general.replaceChildren(...(errors._form ? [el('p', { className: 'field-error' }, errors._form)] : []));
    for (const field of config.fields) {
      fieldErrors[field.key].textContent = errors[field.key] || '';
      inputs[field.key].setAttribute('aria-invalid', String(Boolean(errors[field.key])));
    }
    const first = config.fields.find((field) => errors[field.key]);
    if (first) inputs[first.key].focus();
    const recipeInput = recipe?.setErrors(errors);
    if (!first) recipeInput?.focus();
  };
  for (const field of config.fields) {
    const input = el(field.type === 'textarea' ? 'textarea' : 'input', {
      id: field.key, name: field.key, type: field.type === 'textarea' ? undefined : field.type || 'text',
      placeholder: field.placeholder, maxLength: field.max || 120,
      required: field.required || false, 'aria-describedby': `${field.key}-error`,
      ...(field.type === 'number' ? { min: '0', max: '2147483647', step: '1' } : {}),
      ...(field.type === 'checkbox' ? { checked: values[field.key] } : { value: values[field.key] }),
      onInput: () => {
        values[field.key] = field.type === 'checkbox' ? input.checked : input.value;
        fieldErrors[field.key].textContent = '';
        input.setAttribute('aria-invalid', 'false');
      }
    });
    inputs[field.key] = input;
    fieldErrors[field.key] = el('span', { id: `${field.key}-error`, className: 'field-error' });
    const label = el('label', { htmlFor: field.key }, field.label + (field.required ? ' *' : ''));
    fieldset.append(el('div', { className: field.type === 'checkbox' ? 'field checkbox-field' : 'field' },
      ...(field.type === 'checkbox' ? [input, label] : [label, input]), fieldErrors[field.key]));
  }
  if (recipe) fieldset.append(recipe.element);
  const form = el('form', { className: 'record-form', noValidate: true, onSubmit: async (event) => {
    event.preventDefault();
    if (submitting) return;
    const errors = { ...validateForm(resource, values), ...recipe?.validate() };
    showErrors(errors);
    if (Object.keys(errors).length) return;
    const data = Object.fromEntries(config.fields.map((field) => [field.key,
      field.type === 'number' ? Number(values[field.key]) : field.type === 'checkbox' ? values[field.key] : String(values[field.key]).trim()]));
    // A real partial PATCH, containing only changed fields.
    if (record) for (const key of Object.keys(data)) if ((record[key] ?? '') === data[key]) delete data[key];
    if (recipe) {
      const lines = recipe.read();
      const original = record?.ingredients.map(({ ingredientId, amount }) => ({ amount, ingredientId }));
      if (!record || JSON.stringify(lines) !== JSON.stringify(original)) data.ingredients = lines;
    }
    if (record && !Object.keys(data).length) return navigate(resource === 'dishes' ? `/dishes/${id}` : base);
    submitting = true;
    fieldset.disabled = true;
    save.disabled = true;
    save.textContent = 'Đang lưu…';
    try {
      const saved = await request(resource, { id, method: id ? 'PATCH' : 'POST', data, signal: ctx.signal });
      if (!ctx.signal.aborted) navigate(resource === 'dishes' ? `/dishes/${saved.id}` : base);
    } catch (error) {
      if (ctx.signal.aborted) return;
      if (error.kind === 'business' && error.code === 'VALIDATION_FAILED') {
        fieldset.disabled = false;
        showErrors(error.fields);
      } else if (error.code === 'NOT_FOUND') errorPanel(error, ctx, base);
      else general.replaceChildren(el('p', { className: 'field-error' }, error.message || 'Không thể lưu. Vui lòng thử lại.'));
    } finally {
      submitting = false;
      fieldset.disabled = false;
      save.disabled = false;
      save.textContent = id ? 'Lưu thay đổi' : `Thêm ${config.singular}`;
    }
  } }, general, fieldset, el('div', { className: 'actions form-actions' }, save, link(base, 'Hủy', 'button secondary')));
  ctx.body.replaceChildren(link(base, '← Quay lại danh sách', 'back'),
    pageHeader(`${id ? 'Sửa' : 'Thêm'} ${config.singular}`, 'Các trường có dấu * là bắt buộc.'), form);
}

async function deletePage(ctx, resource, id) {
  const config = resources[resource];
  const base = `/admin/${resource}`;
  document.title = `Soucha · Xóa ${config.singular}`;
  loading(ctx);
  try {
    const record = await request(resource, { id, signal: ctx.signal });
    if (ctx.signal.aborted) return;
    let submitting = false;
    const message = el('p', { className: 'field-error', role: 'alert' });
    const button = el('button', { type: 'button', className: 'danger', onClick: async () => {
      if (submitting) return;
      submitting = true;
      button.disabled = true;
      button.textContent = 'Đang xóa…';
      message.textContent = '';
      try {
        await request(resource, { id, method: 'DELETE', signal: ctx.signal });
        if (!ctx.signal.aborted) navigate(base);
      } catch (error) {
        if (ctx.signal.aborted) return;
        if (error.code === 'NOT_FOUND') errorPanel(error, ctx, base);
        else message.textContent = error.message || 'Không thể xóa. Vui lòng thử lại.';
      } finally {
        submitting = false;
        button.disabled = false;
        button.textContent = 'Xác nhận xóa';
      }
    } }, 'Xác nhận xóa');
    ctx.body.replaceChildren(link(base, '← Quay lại danh sách', 'back'),
      el('section', { className: 'delete-panel' }, el('span', { className: 'eyebrow' }, 'XÁC NHẬN THAO TÁC'),
        el('h1', {}, `Xóa ${config.singular}?`), el('p', {}, 'Bạn sắp xóa ', el('strong', {}, record.name), '. Thao tác này không thể hoàn tác.'),
        el('p', {}, 'Dữ liệu chỉ bị xóa khi bạn bấm nút xác nhận bên dưới.'), message,
        el('div', { className: 'actions' }, button, link(base, 'Hủy, giữ bản ghi', 'button secondary'))));
  } catch (error) { errorPanel(error, ctx, base); }
}

function renderRoute() {
  currentController?.abort();
  const url = new URL(location.href);
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  if (pathname === '/' || pathname === '/admin') return navigate(pathname === '/' ? '/dishes' : '/admin/dishes', { replace: true });
  document.querySelectorAll('.site-header nav a').forEach((anchor) => anchor.setAttribute('aria-current',
    pathname.startsWith('/admin') === anchor.pathname.startsWith('/admin') ? 'page' : 'false'));
  const admin = pathname.match(/^\/admin\/(dishes|chefs|ingredients)(?:\/(new)|\/([^/]+)\/(edit|delete))?$/);
  const detail = admin ? null : pathname.match(/^\/admin\/(dishes|chefs)\/([^/]+)$/);
  const ingredientNew = pathname.match(/^\/admin\/dishes\/([^/]+)\/ingredients\/new$/);
  const relation = pathname.match(/^\/admin\/(dishes|chefs)\/([^/]+)\/(ingredients|dishes)\/([^/]+)\/(edit|delete)$/);
  const validRelation = relation && ((relation[1] === 'dishes' && relation[3] === 'ingredients') || (relation[1] === 'chefs' && relation[3] === 'dishes' && relation[5] === 'delete'));
  const ctx = createContext(admin?.[1] || detail?.[1] || (ingredientNew ? 'dishes' : validRelation ? relation[1] : undefined));
  const helpers = { loading, errorPanel, pageHeader, navigate };
  let job;
  if (pathname === '/dishes') job = dishList(ctx, url);
  else if (/^\/dishes\/[^/]+$/.test(pathname)) job = dishDetail(ctx, pathname.split('/')[2]);
  else if (ingredientNew) job = ingredientForm(ctx, ingredientNew[1], undefined, helpers);
  else if (validRelation) job = relation[5] === 'edit' ? ingredientForm(ctx, relation[2], relation[4], helpers) : unlinkPage(ctx, relation[1], relation[2], relation[4], helpers);
  else if (detail) job = detail[1] === 'dishes' ? recipePage(ctx, detail[2], helpers) : chefPage(ctx, detail[2], helpers);
  else if (admin) {
    const [, resource, isNew, id, action] = admin;
    job = isNew ? recordForm(ctx, resource) : action === 'edit' ? recordForm(ctx, resource, id) :
      action === 'delete' ? deletePage(ctx, resource, id) : adminList(ctx, resource);
  } else {
    document.title = 'Soucha · Không tìm thấy trang';
    ctx.body.append(panel('notFound', 'Không tìm thấy trang', 'Đường dẫn này không có trong Soucha.', link('/dishes', 'Về thực đơn', 'button')));
  }
  job?.catch((error) => errorPanel(error, ctx));
  window.scrollTo(0, 0);
}
renderRoute();
