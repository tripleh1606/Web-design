import { request } from './api.js';
import { el, link, dishImage } from './dom.js';
import { money, categoryLabel } from './resources.js';
import { createRecipeEditor } from './recipe-editor.js';

export async function recipePage(ctx, id, helpers) {
  const base = `/admin/dishes/${id}`;
  helpers.loading(ctx);
  try {
    const dish = await request('dishes', { id, signal: ctx.signal });
    if (ctx.signal.aborted) return;
    document.title = `Soucha · Công thức ${dish.name}`;
    const table = el('table', { className: 'relation-table' },
      el('thead', {}, el('tr', {}, ['Nguyên liệu', 'Lượng / phần', 'Tồn kho', 'Đủ cho', ...(helpers.can('recipe.write') ? ['Thao tác'] : [])].map((title) => el('th', { scope: 'col' }, title)))),
      el('tbody', {}, dish.ingredients.map((line) => el('tr', {},
        el('td', {}, line.ingredient.name), el('td', {}, `${line.amount} ${line.ingredient.unit}`),
        el('td', {}, `${line.ingredient.stock} ${line.ingredient.unit}`),
        el('td', {}, `${Math.floor(line.ingredient.stock / line.amount)} phần`),
        helpers.can('recipe.write') ? el('td', {}, el('div', { className: 'actions' }, link(`${base}/ingredients/${line.ingredientId}/edit`, 'Sửa lượng', 'button secondary'), link(`${base}/ingredients/${line.ingredientId}/delete`, 'Gỡ', 'button danger-outline'))) : null))));
    ctx.body.replaceChildren(link('/admin/dishes', '← Quay lại danh sách món', 'back'),
      helpers.pageHeader(dish.name, 'Công thức và nguyên liệu', helpers.can('dish.write') ? link(`${base}/edit`, 'Sửa món & công thức', 'button secondary') : null),
      el('section', { className: 'recipe-summary' }, dishImage(dish, 'recipe-summary-image'),
        el('div', {}, el('p', {}, dish.description || 'Chưa có mô tả.'),
          el('p', { className: 'recipe-total', 'data-servings': String(dish.servings) }, 'Có thể làm ', el('strong', {}, String(dish.servings)), ' phần với nguyên liệu hiện tại.'),
          el('p', { className: 'muted' }, 'Số phần được tính theo nguyên liệu thiếu nhất; công thức trống = 0 phần.'))),
      el('section', { className: 'relation-panel' },
        el('div', { className: 'relation-heading' }, el('h2', {}, 'Nguyên liệu trong công thức'), helpers.can('recipe.write') ? link(`${base}/ingredients/new`, '+ Thêm nguyên liệu', 'button') : null),
        dish.ingredients.length ? el('div', { className: 'relation-table-wrap' }, table) : el('p', { className: 'muted' }, 'Chưa có nguyên liệu trong công thức.')),
      Array.isArray(dish.chefs) ? el('section', { className: 'relation-panel' }, el('h2', {}, 'Đầu bếp phụ trách'),
        dish.chefs.length ? el('ul', {}, dish.chefs.map((row) => el('li', {}, link(`/admin/chefs/${row.chefId}`, row.chef.name)))) : el('p', { className: 'muted' }, 'Chưa gán đầu bếp. Gán món tại trang chi tiết đầu bếp.'),
        link('/admin/chefs', 'Quản lý đầu bếp →', 'back')) : null);
  } catch (error) { helpers.errorPanel(error, ctx, '/admin/dishes'); }
}

export async function chefPage(ctx, id, helpers) {
  const base = `/admin/chefs/${id}`;
  helpers.loading(ctx);
  try {
    const chef = await request('chefs', { id, signal: ctx.signal });
    if (ctx.signal.aborted) return;
    const ownCookingList = helpers.ownChefId === Number(id);
    document.title = ownCookingList ? 'Soucha · Món tôi có thể chế biến' : `Soucha · Món của ${chef.name}`;
    const writableAssignments = helpers.canManageAssignment(id);

    let allDishes = null;
    let dishesLoading = false;
    let isOpen = false;

    const subtitle = () => `${chef.name} · ${chef.specialty} · ${chef.dishes.length} món có thể chế biến`;
    const subtitleNode = el('p', {}, subtitle());
    const headerNode = el('div', { className: 'page-heading' },
      el('div', {},
        el('span', { className: 'eyebrow' }, 'SOUCHA / QUẢN TRỊ'),
        el('h1', {}, ownCookingList ? 'Món tôi có thể chế biến' : chef.name),
        subtitleNode
      ),
      helpers.can('chef.write') ? link(`/admin/chefs/${id}/edit`, 'Sửa đầu bếp', 'button secondary') : null
    );

    const assignedContainer = el('div', { className: 'assigned-dishes-container' });
    function renderAssignedDishes() {
      if (!chef.dishes.length) {
        assignedContainer.replaceChildren(el('p', { className: 'muted' }, 'Chưa có món nào. Bấm nút thêm món bên dưới để chọn món bạn có thể chế biến.'));
        return;
      }
      const list = el('div', { className: 'admin-list' }, chef.dishes.map((row) =>
        el('article', { className: 'admin-row assigned-dish' },
          dishImage(row.dish, 'admin-thumb'),
          el('div', { className: 'row-copy' },
            el('h3', {}, link(`/admin/dishes/${row.dishId}`, row.dish.name)),
            el('p', {}, `${categoryLabel(row.dish.category)} · ${money(row.dish.price)}`)
          ),
          writableAssignments ? el('div', { className: 'actions' }, link(`${base}/dishes/${row.dishId}/delete`, ownCookingList ? 'Gỡ khỏi danh sách' : 'Gỡ món', 'button danger-outline')) : null
        )
      ));
      assignedContainer.replaceChildren(list);
    }
    renderAssignedDishes();

    const errorBanner = el('p', { className: 'field-error', role: 'alert' });
    const normalizeSearch = value => value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLocaleLowerCase('vi').trim();
    const availableResults = el('div');
    const searchInput = el('input', { id: 'cooking-dish-search', type: 'search', placeholder: 'Nhập tên món…', onInput: renderAvailableDishes });
    const dropdownContent = el('div', { id: 'cooking-dish-picker', className: 'dropdown-content', hidden: true },
      el('div', { className: 'field' }, el('label', { htmlFor: 'cooking-dish-search' }, 'Tìm món trong thực đơn'), searchInput), errorBanner, availableResults);

    function renderAvailableDishes() {
      const assignedIds = new Set(chef.dishes.map((r) => r.dishId));
      const terms = normalizeSearch(searchInput.value).split(/\s+/).filter(Boolean);
      const available = (allDishes || []).filter((d) => !assignedIds.has(d.id) && terms.every(term => normalizeSearch(d.name).includes(term)));

      if (!available.length) {
        availableResults.replaceChildren(el('p', { className: 'muted', role: 'status' }, searchInput.value.trim() ? 'Không tìm thấy món phù hợp chưa có trong danh sách của bạn.' : 'Không còn món nào để thêm, hoặc thực đơn đang trống.'));
        return;
      }

      const list = el('div', { className: 'admin-list' }, available.map((dish) => {
        let adding = false;
        const addBtn = el('button', {
          type: 'button',
          className: 'button',
          onClick: async () => {
            if (adding) return;
            adding = true;
            addBtn.disabled = true;
            addBtn.textContent = 'Đang thêm…';
            errorBanner.textContent = '';
            try {
              const res = await request('chefs', {
                id,
                path: 'dishes',
                method: 'POST',
                data: { dishId: dish.id },
                signal: ctx.signal
              });
              if (ctx.signal.aborted) return;
              chef.dishes.push(res && res.dish ? res : { chefId: Number(id), dishId: dish.id, dish });
              subtitleNode.textContent = subtitle();
              renderAssignedDishes();
              renderAvailableDishes();
            } catch (err) {
              if (ctx.signal.aborted) return;
              adding = false;
              addBtn.disabled = false;
              addBtn.textContent = 'Thêm món';
              errorBanner.textContent = err.code === 'VALIDATION_FAILED'
                ? (err.fields.dishId || err.fields._form || err.message)
                : err.message || 'Không thể thêm món.';
            }
          }
        }, 'Thêm món');

        return el('article', { className: 'admin-row available-dish' },
          dishImage(dish, 'admin-thumb'),
          el('div', { className: 'row-copy' },
            el('h3', {}, link(`/admin/dishes/${dish.id}`, dish.name)),
            el('p', {}, `${categoryLabel(dish.category)} · ${money(dish.price)}`)
          ),
          el('div', { className: 'actions' }, addBtn)
        );
      }));

      availableResults.replaceChildren(el('p', { className: 'muted', role: 'status' }, `${available.length} món có thể thêm`), list);
    }

    const dropdownArrow = el('span', { className: 'dropdown-arrow', 'aria-hidden': 'true' }, '▶');
    const toggleButton = el('button', {
      type: 'button',
      className: 'dropdown-toggle-heading',
      'aria-expanded': 'false',
      'aria-controls': 'cooking-dish-picker',
      onClick: async () => {
        isOpen = !isOpen;
        toggleButton.setAttribute('aria-expanded', String(isOpen));
        dropdownContent.hidden = !isOpen;
        if (!isOpen) return;

        if (!allDishes && !dishesLoading) {
          dishesLoading = true;
          availableResults.replaceChildren(el('p', { className: 'muted' }, 'Đang tải danh sách món…'));
          try {
            allDishes = await request('dishes', { signal: ctx.signal });
            dishesLoading = false;
            if (!ctx.signal.aborted) { renderAvailableDishes(); if (isOpen) searchInput.focus(); }
          } catch (err) {
            dishesLoading = false;
            if (ctx.signal.aborted) return;
            availableResults.replaceChildren(el('p', { className: 'field-error' }, 'Không thể tải danh sách món. Đóng và mở lại để thử lại.'));
          }
        } else if (allDishes) {
          renderAvailableDishes();
        }
      }
    }, dropdownArrow, el('span', { className: 'dropdown-title' }, ownCookingList ? '+ Thêm món có thể chế biến' : 'Thêm món phụ trách'));

    ctx.body.replaceChildren(
      link(ownCookingList ? '/dishes' : '/admin/chefs', ownCookingList ? '← Xem thực đơn' : '← Quay lại đầu bếp', 'back'),
      headerNode,
      el('section', { className: 'relation-panel' },
        el('h2', {}, ownCookingList ? 'Danh sách món của tôi' : 'Món đầu bếp có thể làm'),
        assignedContainer
      ),
      writableAssignments ? el('section', { className: 'relation-panel dropdown-panel' },
        toggleButton,
        dropdownContent
      ) : null
    );
  } catch (error) { helpers.errorPanel(error, ctx, '/admin/chefs'); }
}

export async function ingredientForm(ctx, dishId, ingredientId, helpers) {
  const base = `/admin/dishes/${dishId}`;
  helpers.loading(ctx);
  try {
    let line;
    let dish;
    let editor;
    if (ingredientId) {
      line = await request('dishes', { id: dishId, path: `ingredients/${ingredientId}`, signal: ctx.signal });
      dish = line.dish;
    } else {
      const result = await Promise.all([request('dishes', { id: dishId, signal: ctx.signal }), request('ingredients', { signal: ctx.signal })]);
      dish = result[0];
      const linked = new Set(dish.ingredients.map((row) => row.ingredientId));
      editor = createRecipeEditor({ ingredients: result[1].filter((row) => !linked.has(row.id)), maxRows: 1 });
    }
    if (ctx.signal.aborted) return;
    document.title = `Soucha · ${line ? 'Sửa lượng nguyên liệu' : 'Thêm nguyên liệu'}`;
    const amount = el('input', { id: 'relation-amount', name: 'amount', type: 'number', value: String(line?.amount || 1), min: '1', step: '1', max: '2147483647', 'aria-describedby': 'relation-amount-error' });
    const amountError = el('p', { className: 'field-error', id: 'relation-amount-error' });
    const general = el('p', { className: 'field-error', role: 'alert' });
    const fieldset = el('fieldset', {}, editor ? editor.element : el('div', { className: 'field' }, el('label', { htmlFor: 'relation-amount' }, `Lượng ${line.ingredient.name} / phần (${line.ingredient.unit}) *`), amount, amountError));
    const save = el('button', { type: 'submit' }, line ? 'Lưu lượng nguyên liệu' : 'Thêm vào công thức');
    let saving = false;
    const form = el('form', { className: 'record-form relation-form', noValidate: true, onSubmit: async (event) => {
      event.preventDefault();
      if (saving) return;
      general.textContent = amountError.textContent = '';
      const errors = editor ? editor.validate() : {};
      if (editor && !editor.read().length) errors.ingredients = 'Thêm một dòng nguyên liệu trước khi lưu.';
      if (!editor && (!/^\d+$/.test(amount.value) || Number(amount.value) < 1 || Number(amount.value) > 2147483647)) errors.amount = 'Nhập số nguyên từ 1 trở lên.';
      editor?.setErrors(errors);
      amountError.textContent = errors.amount || '';
      if (Object.keys(errors).length) return;
      saving = true;
      fieldset.disabled = save.disabled = true;
      try {
        await request('dishes', { id: dishId, path: 'ingredients' + (ingredientId ? '/' + ingredientId : ''), method: ingredientId ? 'PATCH' : 'POST',
          data: editor ? editor.read()[0] : { amount: Number(amount.value) }, signal: ctx.signal });
        if (!ctx.signal.aborted) helpers.navigate(base);
      } catch (error) {
        if (ctx.signal.aborted) return;
        if (error.code === 'VALIDATION_FAILED') {
          if (editor) editor.setErrors(Object.fromEntries(Object.entries(error.fields).map(([key, value]) => [key === '_form' ? 'ingredients' : 'ingredients.0.' + key, value])));
          else amountError.textContent = error.fields.amount || '';
          general.textContent = error.fields._form || '';
        } else helpers.errorPanel(error, ctx, base);
      } finally { saving = false; fieldset.disabled = save.disabled = false; }
    } }, general, fieldset, el('div', { className: 'actions form-actions' }, save, link(base, 'Hủy', 'button secondary')));
    ctx.body.replaceChildren(link(base, '← Quay lại công thức', 'back'), helpers.pageHeader(line ? 'Sửa lượng nguyên liệu' : 'Thêm nguyên liệu vào món', dish.name), form);
  } catch (error) { helpers.errorPanel(error, ctx, base); }
}

export async function unlinkPage(ctx, resource, id, relationId, helpers) {
  const isRecipe = resource === 'dishes';
  const relation = isRecipe ? 'ingredients' : 'dishes';
  const base = `/admin/${resource}/${id}`;
  helpers.loading(ctx);
  try {
    const row = await request(resource, { id, path: `${relation}/${relationId}`, signal: ctx.signal });
    if (ctx.signal.aborted) return;
    const label = isRecipe ? row.ingredient.name : row.dish.name;
    document.title = 'Soucha · Xác nhận gỡ liên kết';
    const errorNode = el('p', { className: 'field-error', role: 'alert' });
    let saving = false;
    const button = el('button', { type: 'button', className: 'danger', onClick: async () => {
      if (saving) return;
      saving = true;
      button.disabled = true;
      try {
        await request(resource, { id, path: `${relation}/${relationId}`, method: 'DELETE', signal: ctx.signal });
        if (!ctx.signal.aborted) helpers.navigate(base);
      } catch (error) { if (!ctx.signal.aborted) errorNode.textContent = error.message; }
      finally { saving = false; button.disabled = false; }
    } }, 'Xác nhận gỡ');
    ctx.body.replaceChildren(link(base, '← Quay lại', 'back'), el('section', { className: 'delete-panel' },
      el('span', { className: 'eyebrow' }, 'XÁC NHẬN GỠ LIÊN KẾT'), el('h1', {}, isRecipe ? 'Gỡ nguyên liệu khỏi món?' : 'Gỡ món khỏi đầu bếp?'),
      el('p', {}, 'Bạn sắp gỡ ', el('strong', {}, label), '. Chỉ liên kết bị xóa; món ăn và nguyên liệu vẫn được giữ lại.'), errorNode,
      el('div', { className: 'actions' }, button, link(base, 'Hủy, giữ liên kết', 'button secondary'))));
  } catch (error) { helpers.errorPanel(error, ctx, base); }
}
