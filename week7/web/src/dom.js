// API/user content always enters textContent or DOM properties, never raw HTML.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === 'className') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((child) => child !== undefined && child !== null));
  return node;
}
export const link = (href, text, className = '') => el('a', { href, 'data-link': '', className }, text);
export function dishImage(record, className = '') {
  const safe = typeof record.image === 'string' && /^\/beverages\/[a-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(record.image);
  return el('img', { src: safe ? record.image : '/logo.svg', alt: record.name || 'Soucha', className, loading: 'lazy', decoding: 'async', onError: (event) => {
    event.target.onerror = null;
    if (!event.target.src.endsWith('/logo.svg')) event.target.src = '/logo.svg';
  } });
}
