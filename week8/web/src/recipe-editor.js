import { el } from './dom.js';
import { createSearchSelect } from './search-select.js';

const positive = (value) => /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 2147483647;
const nonnegative = (value) => /^\d+$/.test(String(value)) && Number(value) <= 2147483647;

export function createRecipeEditor({ ingredients, initial = [], maxRows = 50 }) {
  const rows = initial.map((line) => ({ mode: 'existing', ingredientId: String(line.ingredientId), amount: String(line.amount), ingredient: { name: '', unit: '', stock: '0' } }));
  const errors = new Map();
  const inputs = new Map();
  const container = el('div', { className: 'recipe-editor-rows' });
  const general = el('p', { className: 'field-error', id: 'ingredients-error', role: 'alert' });
  const preview = el('p', { className: 'recipe-preview', 'aria-live': 'polite' });
  let nextDomId = 0;
  const updatePreview = () => {
    const servings = rows.length ? Math.min(...rows.map((row) => {
      const stock = row.mode === 'new' ? Number(row.ingredient.stock) : ingredients.find((item) => String(item.id) === row.ingredientId)?.stock;
      return positive(row.amount) && Number.isInteger(stock) && stock >= 0 ? Math.floor(stock / Number(row.amount)) : 0;
    })) : 0;
    preview.textContent = `Có thể làm ${servings} phần với tồn kho hiện tại. Lưu công thức không trừ tồn kho.`;
  };
  const field = (labelText, key, control) => {
    const input = control.input || control;
    const id = `recipe-field-${nextDomId++}`;
    input.id = id;
    input.setAttribute('aria-describedby', id + '-error');
    const error = el('span', { id: id + '-error', className: 'field-error', 'data-error-for': key });
    errors.set(key, error);
    inputs.set(key, input);
    return el('div', { className: 'field' }, el('label', { htmlFor: id }, labelText), control.element || input, error);
  };
  function render() {
    errors.clear();
    inputs.clear();
    container.replaceChildren();
    if (!rows.length) container.append(el('p', { className: 'muted recipe-empty' }, 'Chưa có nguyên liệu. Bạn có thể chọn từ kho hoặc tạo nguyên liệu mới ngay tại đây.'));
    rows.forEach((row, index) => {
      const prefix = `ingredients.${index}.`;
      const mode = el('select', { value: row.mode, onChange: (event) => { row.mode = event.target.value; render(); } },
        el('option', { value: 'existing', selected: row.mode === 'existing' }, 'Chọn từ kho'),
        el('option', { value: 'new', selected: row.mode === 'new' }, 'Tạo nguyên liệu mới'));
      const fields = [];
      if (row.mode === 'existing') {
        const picker = createSearchSelect({
          value: row.ingredientId, name: prefix + 'ingredientId', placeholder: 'Tìm nguyên liệu trong kho…',
          attributes: { 'data-recipe-key': 'ingredientId' },
          options: ingredients.map((item) => ({ value: item.id, label: `${item.name} · ${item.stock} ${item.unit} trong kho`, searchText: `${item.name} ${item.unit}` })),
          onChange: (value) => {
            row.ingredientId = value;
            if (errors.has(prefix + 'ingredientId')) errors.get(prefix + 'ingredientId').textContent = '';
            inputs.get(prefix + 'ingredientId')?.setAttribute('aria-invalid', 'false');
            updatePreview();
          }
        });
        row.ingredientId = picker.value;
        fields.push(field('Nguyên liệu *', prefix + 'ingredientId', picker));
      } else {
        for (const [key, label] of [['name', 'Tên nguyên liệu mới *'], ['unit', 'Đơn vị *'], ['stock', 'Tồn kho ban đầu *']]) {
          fields.push(field(label, prefix + 'ingredient.' + key, el('input', {
            type: key === 'stock' ? 'number' : 'text', value: row.ingredient[key], 'data-recipe-key': key,
            ...(key === 'stock' ? { min: '0', step: '1', max: '2147483647' } : { maxLength: 120 }),
            placeholder: key === 'unit' ? 'g, ml, quả…' : undefined,
            onInput: (event) => { row.ingredient[key] = event.target.value; updatePreview(); }
          })));
        }
      }
      fields.push(field('Lượng dùng cho 1 phần *', prefix + 'amount', el('input', {
        type: 'number', min: '1', max: '2147483647', step: '1', value: row.amount, 'data-recipe-key': 'amount',
        onInput: (event) => { row.amount = event.target.value; updatePreview(); }
      })));
      container.append(el('section', { className: 'recipe-editor-row', 'data-recipe-row': '' },
        el('div', { className: 'relation-heading' }, el('h3', {}, `Nguyên liệu ${index + 1}`),
          el('button', { type: 'button', className: 'button danger-outline', 'aria-label': `Bỏ dòng nguyên liệu ${index + 1}`, onClick: () => { rows.splice(index, 1); general.textContent = ''; render(); } }, 'Bỏ dòng')),
        field(`Nguồn nguyên liệu ${index + 1}`, prefix + 'mode', mode), el('div', { className: 'recipe-field-grid' }, fields)));
    });
    updatePreview();
  }
  const element = el('section', { className: 'recipe-editor', 'aria-labelledby': 'recipe-editor-title' },
    el('h2', { id: 'recipe-editor-title' }, 'Nguyên liệu cho món'),
    el('p', { className: 'muted' }, 'Chọn lượng dùng cho mỗi phần. Nguyên liệu mới được tạo cùng lúc với món, sau khi toàn bộ dữ liệu hợp lệ.'),
    general, container, el('button', { type: 'button', className: 'button secondary', onClick: () => {
      if (rows.length >= maxRows) { general.textContent = `Tối đa ${maxRows} nguyên liệu cho lần lưu này.`; return; }
      rows.push({ mode: ingredients.length ? 'existing' : 'new', ingredientId: '', amount: '1', ingredient: { name: '', unit: '', stock: '0' } });
      render();
    } }, '+ Thêm dòng nguyên liệu'), preview);
  render();
  return {
    element,
    read() { return rows.map((row) => ({ amount: Number(row.amount), ...(row.mode === 'new' ? { ingredient: { name: row.ingredient.name.trim(), unit: row.ingredient.unit.trim(), stock: Number(row.ingredient.stock) } } : { ingredientId: Number(row.ingredientId) }) })); },
    validate() {
      const fields = {};
      const seen = new Set();
      rows.forEach((row, index) => {
        const prefix = `ingredients.${index}.`;
        if (!positive(row.amount)) fields[prefix + 'amount'] = 'Nhập số nguyên từ 1 trở lên.';
        if (row.mode === 'existing') {
          if (!positive(row.ingredientId)) fields[prefix + 'ingredientId'] = 'Chọn một nguyên liệu.';
          else if (seen.has(row.ingredientId)) fields[prefix + 'ingredientId'] = 'Nguyên liệu này đã được chọn.';
          seen.add(row.ingredientId);
        } else {
          for (const key of ['name', 'unit']) {
            if (!row.ingredient[key].trim()) fields[prefix + 'ingredient.' + key] = 'Trường này không được để trống.';
            else if (row.ingredient[key].trim().length > 120) fields[prefix + 'ingredient.' + key] = 'Tối đa 120 ký tự.';
          }
          if (!nonnegative(row.ingredient.stock)) fields[prefix + 'ingredient.stock'] = 'Nhập số nguyên không âm.';
        }
      });
      return fields;
    },
    setErrors(fields) {
      general.textContent = fields.ingredients || '';
      for (const [key, node] of errors) {
        node.textContent = fields[key] || '';
        inputs.get(key).setAttribute('aria-invalid', String(Boolean(fields[key])));
      }
      const first = Object.keys(fields).find((key) => inputs.has(key));
      return first ? inputs.get(first) : undefined;
    }
  };
}
