function imageURL(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value, document.baseURI);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    if (url.protocol === 'blob:' && url.origin === window.location.origin) return url.href;
  } catch {
    // Invalid URLs become the same visible error state as failed image requests.
  }

  return null;
}

function dimensions(value) {
  return Number.isSafeInteger(value?.width) && value.width > 0
    && Number.isSafeInteger(value?.height) && value.height > 0;
}

/** Create a responsive, naturally proportioned photo with a perforated paper frame. */
export function StampPhoto(photo, { sizes = '100vw', loading = 'lazy' } = {}) {
  const frame = document.createElement('figure');
  frame.className = 'stamp-photo';

  const image = document.createElement('img');
  image.className = 'stamp-photo__image';
  image.alt = typeof photo?.alt === 'string'
    ? photo.alt
    : typeof photo?.title === 'string' ? photo.title : 'Ảnh';
  image.loading = loading === 'eager' ? 'eager' : 'lazy';
  image.decoding = 'async';

  const error = document.createElement('p');
  error.className = 'stamp-photo__error';
  error.hidden = true;
  error.setAttribute('role', 'status');
  error.textContent = typeof photo?.title === 'string' && photo.title.trim()
    ? `Không thể hiển thị “${photo.title}”.`
    : 'Không thể hiển thị ảnh này.';

  const variants = [];
  const widths = new Set();
  if (Array.isArray(photo?.variants)) {
    for (const variant of photo.variants) {
      const url = imageURL(variant?.url);
      if (!url || !dimensions(variant) || widths.has(variant.width)) continue;
      widths.add(variant.width);
      variants.push({ url, width: variant.width, height: variant.height });
    }
    variants.sort((a, b) => a.width - b.width);
  }

  const source = variants.length ? variants[variants.length - 1] : photo;
  const sourceURL = variants.length ? source.url : imageURL(source?.url);
  const intrinsic = dimensions(photo) ? photo : dimensions(source) ? source : null;
  if (intrinsic) {
    image.width = intrinsic.width;
    image.height = intrinsic.height;
    error.style.aspectRatio = `${intrinsic.width} / ${intrinsic.height}`;
  }

  const showError = () => {
    image.hidden = true;
    error.hidden = false;
    frame.classList.add('stamp-photo--error');
  };
  image.addEventListener('error', showError, { once: true });
  frame.append(image, error);

  if (sourceURL) {
    if (variants.length) {
      // Commas and spaces in URLs must not become srcset separators.
      image.srcset = variants
        .map(({ url, width }) => `${url.replaceAll(',', '%2C').replaceAll(' ', '%20')} ${width}w`)
        .join(', ');
      image.sizes = typeof sizes === 'string' && sizes.trim() ? sizes : '100vw';
    }
    image.src = sourceURL;
  } else {
    showError();
  }

  return frame;
}
