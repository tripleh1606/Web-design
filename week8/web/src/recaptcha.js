import { el } from './dom.js';

let loadingScript;

function loadRecaptcha() {
  if (window.grecaptcha?.render) return Promise.resolve(window.grecaptcha);
  if (loadingScript) return loadingScript;
  const callback = 'souchaRecaptchaReady';
  loadingScript = new Promise((resolve, reject) => {
    const script = el('script', {
      src: `https://www.google.com/recaptcha/api.js?onload=${callback}&render=explicit&hl=vi`,
      async: true
    });
    const timeout = setTimeout(fail, 12000);
    function fail() {
      clearTimeout(timeout);
      script.remove();
      reject(new Error('Không tải được reCAPTCHA. Kiểm tra kết nối và thử lại.'));
    }
    window[callback] = () => {
      clearTimeout(timeout);
      resolve(window.grecaptcha);
    };
    script.addEventListener('error', fail, { once: true });
    document.head.append(script);
  }).catch((error) => {
    loadingScript = undefined;
    throw error;
  });
  return loadingScript;
}

export function createCaptcha(siteKey, signal) {
  const widget = el('div');
  const status = el('p', { className: 'muted', role: 'status' });
  const retry = el('button', { type: 'button', className: 'secondary', hidden: true, onClick: mount }, 'Tải lại reCAPTCHA');
  const element = el('div', { className: 'auth-captcha' }, widget, status, retry);
  let client, id;
  let token = '';

  function reset() {
    token = '';
    if (id !== undefined) {
      client.reset(id);
      status.textContent = 'Tích ô xác minh để tiếp tục.';
    }
  }

  async function mount() {
    retry.hidden = true;
    if (!siteKey) {
      status.textContent = 'Dịch vụ reCAPTCHA chưa được cấu hình.';
      return;
    }
    status.textContent = 'Đang tải reCAPTCHA…';
    try {
      client = await loadRecaptcha();
      if (signal.aborted || !element.isConnected) return;
      if (id !== undefined) {
        reset();
        return;
      }
      id = client.render(widget, {
        sitekey: siteKey,
        size: matchMedia('(max-width: 460px)').matches ? 'compact' : 'normal',
        callback(value) {
          token = value;
          status.textContent = 'Đã xác minh.';
        },
        'expired-callback'() {
          token = '';
          status.textContent = 'Xác minh đã hết hạn. Vui lòng tích lại.';
        },
        'error-callback'() {
          token = '';
          status.textContent = 'reCAPTCHA gặp lỗi kết nối. Vui lòng thử lại.';
          retry.hidden = false;
        }
      });
      status.textContent = 'Tích ô xác minh để tiếp tục.';
    } catch {
      if (signal.aborted) return;
      status.textContent = 'Không tải được reCAPTCHA. Kiểm tra kết nối và thử lại.';
      retry.hidden = false;
    }
  }

  signal.addEventListener('abort', reset, { once: true });
  mount();
  return { element, value: () => token, reset };
}
