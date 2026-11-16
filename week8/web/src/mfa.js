import { request } from './api.js';
import { el, link } from './dom.js';

// Module memory survives SPA navigation, but never a reload or a new tab.
let pendingChallenge;
let loginNotice = '';
export function setPendingChallenge({ challenge, expiresIn = 300 }) {
  pendingChallenge = { challenge, expiresAt: Date.now() + expiresIn * 1000 };
}
export function clearPendingChallenge() { pendingChallenge = undefined; }
export function takeMfaNotice() {
  const message = loginNotice;
  loginNotice = '';
  return message;
}
async function mfaRequest(path, options) {
  try {
    return await request('auth', { path: `mfa${path ? '/' + path : ''}`, collection: false, ...options });
  } catch (error) {
    if (error.code === 'AUTH_REQUIRED') loginNotice = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để quản lý bảo mật.';
    throw error;
  }
}

function cardFor(ctx, title) {
  document.title = `Soucha · ${title}`;
  const card = el('section', { className: 'auth-card mfa-card' },
    el('span', { className: 'eyebrow' }, 'SOUCHA / BẢO MẬT'), el('h1', {}, title));
  ctx.body.replaceChildren(card);
  // Remove passwords, QR, secrets and recovery codes from even detached views.
  ctx.signal.addEventListener('abort', () => card.replaceChildren(), { once: true });
  return card;
}
function field(name, label, props = {}) {
  return el('div', { className: 'field' }, el('label', { htmlFor: name }, label),
    el('input', { id: name, name, required: true, ...props }));
}
const passwordField = () => field('password', 'Mật khẩu hiện tại', { type: 'password', autocomplete: 'current-password', maxLength: 128 });
const codeField = (recovery = false) => field('code', recovery ? 'Mã xác thực hoặc mã khôi phục' : 'Mã 6 chữ số từ ứng dụng xác thực', {
  type: 'text', autocomplete: 'one-time-code', maxLength: recovery ? 80 : 6,
  ...(recovery ? {} : { inputMode: 'numeric', pattern: '[0-9]{6}' })
});
let formSequence = 0;
function actionForm(ctx, label, inputs, action) {
  const prefix = `mfa-${++formSequence}`;
  for (const wrapper of inputs) {
    const input = wrapper.querySelector('input');
    input.id = `${prefix}-${input.name}`;
    wrapper.querySelector('label').htmlFor = input.id;
  }
  const error = el('p', { className: 'field-error', role: 'alert' });
  const status = el('p', { className: 'auth-message', role: 'status' });
  const fields = el('fieldset', { className: 'auth-fields' }, inputs);
  const button = el('button', { type: 'submit' }, label);
  let busy = false;
  const form = el('form', { onSubmit: async (event) => {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(form));
    if (data.code) data.code = data.code.trim();
    busy = fields.disabled = button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    error.textContent = '';
    status.textContent = 'Đang xử lý…';
    try { await action(data); }
    catch (problem) {
      if (!ctx.signal.aborted) error.textContent = problem.status === 429
        ? 'Bạn đã thử quá nhiều lần. Vui lòng đợi rồi thử lại.' : problem.message;
    } finally {
      // Never retain the password or an already submitted one-time code.
      for (const input of form.querySelectorAll('input')) input.value = '';
      busy = fields.disabled = button.disabled = false;
      form.setAttribute('aria-busy', 'false');
      status.textContent = '';
    }
  } }, fields, error, status, el('div', { className: 'actions' }, button));
  return form;
}

export function mfaPage(ctx, { navigate, setAccount }) {
  if (!pendingChallenge || pendingChallenge.expiresAt <= Date.now()) {
    clearPendingChallenge();
    loginNotice = 'Phiên xác thực đã hết hạn hoặc trang đã được tải lại. Vui lòng đăng nhập lại.';
    navigate('/login', { replace: true });
    return;
  }
  const card = cardFor(ctx, 'Xác thực hai bước');
  card.append(el('p', {}, 'Nhập mã từ ứng dụng xác thực. Nếu mất thiết bị, bạn có thể dùng một mã khôi phục chưa sử dụng. Mỗi mã khôi phục chỉ dùng được một lần.'),
    actionForm(ctx, 'Xác minh và đăng nhập', [codeField(true)], async (data) => {
      if (!pendingChallenge || pendingChallenge.expiresAt <= Date.now()) {
        clearPendingChallenge();
        loginNotice = 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.';
        return navigate('/login', { replace: true });
      }
      const result = await mfaRequest('', { method: 'POST', data: { challenge: pendingChallenge.challenge, code: data.code }, signal: ctx.signal });
      if (ctx.signal.aborted) return;
      clearPendingChallenge();
      setAccount(result);
      navigate('/admin/dishes', { replace: true });
    }), el('div', { className: 'auth-links' }, link('/login', 'Hủy và về đăng nhập')));
}

export async function securityPage(ctx, { setAccount }) {
  const card = cardFor(ctx, 'Bảo mật tài khoản');
  const content = el('div');
  card.append(content, el('div', { className: 'auth-links' }, link('/admin/dishes', 'Về quản trị')));
  let enabled = false;
  let recoveryRemaining = 0;
  let setupExpiresAt = 0;
  const returnButton = () => el('button', { type: 'button', className: 'secondary', onClick: renderStatus }, 'Đóng và về bảo mật');
  const showRecovery = (codes) => {
    content.replaceChildren(el('h2', {}, 'Lưu mã khôi phục ngay'),
      el('p', {}, 'Các mã này chỉ hiển thị trong lần này. Hãy lưu ở nơi an toàn trước khi rời trang. Mỗi mã chỉ dùng được một lần; bộ mã mới thay thế toàn bộ mã cũ.'),
      el('ul', { className: 'mfa-recovery' }, codes.map((code) => el('li', {}, code))), returnButton());
  };
  function renderStatus() {
    content.replaceChildren(el('p', { role: 'status' }, enabled
      ? `Xác thực hai bước đang bật. Còn ${recoveryRemaining} mã khôi phục.` : 'Xác thực hai bước chưa bật.'));
    if (!enabled) {
      const remaining = Math.max(0, Math.ceil((setupExpiresAt - Date.now()) / 1000));
      if (remaining > 0) {
        content.append(el('h2', {}, 'Tiếp tục thiết lập đang chờ'),
          el('p', {}, `Thiết lập đang chờ còn khoảng ${remaining} giây tại lúc mở trang. Nhập mã từ tài khoản bạn đã quét trong ứng dụng xác thực để hoàn tất. Khóa và QR cũ không hiển thị lại.`),
          actionForm(ctx, 'Xác nhận thiết lập đang chờ', [codeField()], enableSetup),
          el('h2', {}, 'Tạo thiết lập mới'),
          el('p', {}, 'Nếu chưa lưu tài khoản trong ứng dụng, bạn có thể bắt đầu lại bên dưới. Thiết lập mới sẽ thay thế khóa và QR đang chờ; bạn phải quét QR mới.'));
      }
      content.append(el('p', {}, 'Dùng ứng dụng như Google Authenticator để thêm lớp bảo vệ cho tài khoản.'),
        actionForm(ctx, 'Bắt đầu thiết lập', [passwordField()], async (data) => {
          const setup = await mfaRequest('setup', { method: 'POST', data, signal: ctx.signal });
          if (ctx.signal.aborted) return;
          setupExpiresAt = Date.now() + (setup.expiresIn ?? 600) * 1000;
          showSetup(setup);
        }));
    } else {
      content.append(el('h2', {}, 'Tạo bộ mã khôi phục mới'),
        el('p', {}, 'Tất cả mã khôi phục cũ sẽ hết hiệu lực ngay khi tạo bộ mã mới.'),
        actionForm(ctx, 'Thay bộ mã khôi phục', [passwordField(), codeField(true)], async (data) => {
          const result = await mfaRequest('recovery', { method: 'POST', data, signal: ctx.signal });
          if (ctx.signal.aborted) return;
          recoveryRemaining = result.recoveryCodes.length;
          showRecovery(result.recoveryCodes);
        }), el('h2', {}, 'Tắt xác thực hai bước'),
        el('p', {}, 'Tắt tính năng sẽ xóa cấu hình và các mã khôi phục. Bạn có thể thiết lập lại sau.'),
        actionForm(ctx, 'Tắt xác thực hai bước', [passwordField(), codeField(true)], async (data) => {
          const result = await mfaRequest('disable', { method: 'POST', data, signal: ctx.signal });
          if (ctx.signal.aborted) return;
          setAccount({ user: result.user, accessToken: result.accessToken, tokenType: result.tokenType });
          enabled = false;
          recoveryRemaining = 0;
          renderStatus();
        }));
    }
  }
  async function enableSetup(data) {
    if (Date.now() >= setupExpiresAt) throw new Error('Thiết lập đã hết hạn. Hãy đóng và bắt đầu lại.');
    const result = await mfaRequest('enable', { method: 'POST', data, signal: ctx.signal });
    if (ctx.signal.aborted) return;
    enabled = true;
    setupExpiresAt = 0;
    recoveryRemaining = result.recoveryCodes.length;
    setAccount({ user: result.user, accessToken: result.accessToken, tokenType: result.tokenType });
    showRecovery(result.recoveryCodes);
  }
  function showSetup(setup) {
    content.replaceChildren(el('h2', {}, 'Thêm tài khoản vào ứng dụng xác thực'),
      el('p', {}, 'Quét mã QR hoặc nhập khóa bên dưới. Thiết lập có hiệu lực trong 10 phút và chỉ bật sau khi bạn xác nhận mã 6 chữ số. Phiên đăng nhập có thể hết hạn sớm hơn; hãy đăng nhập lại, mở Bảo mật và xác nhận thiết lập đang chờ bằng mã từ tài khoản đã quét.'),
      /^data:image\/png;base64,/.test(setup.qrCodeDataUrl) ? el('img', { className: 'mfa-qr', src: setup.qrCodeDataUrl, alt: 'Mã QR thiết lập ứng dụng xác thực' }) : null,
      el('p', {}, 'Khóa thiết lập (giữ bí mật):'), el('code', { className: 'mfa-secret' }, setup.secret),
      actionForm(ctx, 'Xác nhận và bật', [codeField()], enableSetup), returnButton());
  }
  content.append(el('p', { role: 'status' }, 'Đang tải trạng thái bảo mật…'));
  try {
    const status = await mfaRequest('status', { signal: ctx.signal });
    if (ctx.signal.aborted) return;
    if (!status.configured) {
      content.replaceChildren(el('p', { role: 'status' }, 'Máy chủ chưa cấu hình xác thực hai bước. Vui lòng thử lại sau.'));
      return;
    }
    enabled = status.enabled;
    recoveryRemaining = status.recoveryRemaining;
    setupExpiresAt = status.setupPending ? Date.now() + Math.max(0, status.setupExpiresIn || 0) * 1000 : 0;
    renderStatus();
  } catch (error) {
    if (ctx.signal.aborted) return;
    content.replaceChildren(el('p', { className: 'field-error', role: 'alert' }, error.message),
      el('button', { type: 'button', onClick: () => securityPage(ctx, { setAccount }) }, 'Thử lại'));
  }
}
