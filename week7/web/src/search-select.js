import { el } from './dom.js';

const normalize = (value) => String(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLocaleLowerCase('vi').trim();
let nextId = 0;

// The displayed text and the selected ID are separate. Typing clears the ID
// until an option is chosen, so a search can never save an old hidden choice.
export function createSearchSelect({ options, value = '', id, name, placeholder = 'Gõ để tìm và chọn…', attributes = {}, onChange = () => {} }) {
  const listId = `search-options-${nextId++}`;
  const items = options.map((option) => ({ ...option, value: String(option.value), search: normalize(option.searchText ?? option.label) }));
  let selected = items.find((item) => item.value === String(value));
  let filtered = [];
  let active = -1;
  let opened = false;
  const hidden = el('input', { type: 'hidden', name, value: selected?.value || '' });
  const list = el('div', { id: listId, role: 'listbox', className: 'search-select-list', hidden: true });
  const input = el('input', {
    type: 'text', id, value: selected?.label || '', placeholder, autoComplete: 'off', spellcheck: false,
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-haspopup': 'listbox',
    'aria-expanded': 'false', 'aria-controls': listId, ...attributes,
    onFocus: () => open(selected ? '' : input.value),
    onClick: () => { if (!opened) open(selected ? '' : input.value); },
    onInput: () => {
      selected = undefined;
      hidden.value = '';
      onChange('');
      open(input.value);
    },
    onKeyDown: (event) => {
      if (event.isComposing) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!opened) {
          open(selected ? '' : input.value);
          active = event.key === 'ArrowDown' ? 0 : filtered.length - 1;
        } else if (filtered.length) active = (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
        updateActive(true);
      } else if (event.key === 'Enter' && opened) {
        event.preventDefault();
        if (filtered[active]) choose(filtered[active]);
      } else if (event.key === 'Escape' && opened) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }
  });
  const toggle = el('button', {
    type: 'button', className: 'search-select-toggle', tabIndex: -1,
    'aria-label': 'Mở danh sách lựa chọn', 'aria-controls': listId,
    onMouseDown: (event) => event.preventDefault(),
    onClick: () => {
      const wasOpen = opened;
      input.focus();
      if (wasOpen) close();
      else open('');
    }
  }, el('span', { 'aria-hidden': 'true' }, '⌄'));
  const element = el('div', {
    className: 'search-select',
    onFocusOut: (event) => { if (!element.contains(event.relatedTarget)) close(); }
  }, input, hidden, toggle, list);

  function close() {
    opened = false;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function updateActive(scroll = false) {
    const nodes = list.querySelectorAll('[role="option"]');
    nodes.forEach((node, index) => node.classList.toggle('active', index === active));
    const node = nodes[active];
    if (node) {
      input.setAttribute('aria-activedescendant', node.id);
      if (scroll) node.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function choose(item) {
    if (input.matches(':disabled')) return;
    selected = item;
    hidden.value = item.value;
    input.value = item.label;
    onChange(item.value);
    close();
  }
  function open(query) {
    if (input.matches(':disabled')) return;
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    filtered = items.filter((item) => terms.every((term) => item.search.includes(term)));
    list.classList.toggle('is-empty', filtered.length === 0);
    active = Math.max(0, filtered.findIndex((item) => item.value === selected?.value));
    list.replaceChildren(...filtered.map((item, index) => el('div', {
      id: `${listId}-${index}`, role: 'option', className: 'search-select-option', 'data-value': item.value,
      'aria-selected': String(item.value === selected?.value),
      onMouseDown: (event) => event.preventDefault(),
      onMouseMove: () => { active = index; updateActive(); },
      onClick: () => choose(item)
    }, item.label)));
    if (!filtered.length) list.append(el('p', { className: 'search-select-empty', role: 'status' }, 'Không tìm thấy kết quả phù hợp.'));
    opened = true;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    updateActive();
  }
  return { element, input, get value() { return selected?.value || ''; } };
}
