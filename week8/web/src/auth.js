import { request } from './api.js';
import { el, link } from './dom.js';
import { createCaptcha } from './recaptcha.js';

export const authPages = new Set(['/login', '/register', '/activate', '/forgot', '/reset', '/logout/confirm']);
const titles = {
  '/login': 'Đăng nhập', '/register': 'Đăng ký', '/activate': 'Kích hoạt tài khoản',
  '/forgot': 'Quên mật khẩu', '/reset': 'Đặt lại mật khẩu', '/logout/confirm': 'Đăng xuất'
};
const authRequest = (path, options) => request('auth', { path, collection: false, ...options });
let pendingEmail = '';
let notice = '';

function field(name, label, props) {
  return el('div', { className: 'field' },
    el('label', { htmlFor: name }, label),
    el('input', { id: name, name, required: true, ...props }),
    el('span', { id: `${name}-error`, className: 'field-error' }));
}

export async function authPage(ctx, pathname, url, { account, navigate, setAccount }) {
  const { signal } = ctx;
  const title = titles[pathname];
  const login = pathname === '/login';
  const register = pathname === '/register';
  const activate = pathname === '/activate';
  const forgot = pathname === '/forgot';
  const reset = pathname === '/reset';
  const logout = pathname === '/logout/confirm';
  const resetToken = reset ? url.searchParams.get('token') || '' : '';
  document.title = `Soucha · ${title}`;

  const message = el('p', { role: 'status', className: 'auth-message' }, notice);
  notice = '';
  const errorMessage = el('p', { role: 'alert', className: 'field-error' });
  const card = el('section', { className: 'auth-card' },
    el('span', { className: 'eyebrow' }, 'SOUCHA / TÀI KHOẢN'), el('h1', {}, title), message, errorMessage);
  ctx.body.replaceChildren(card);
  if (reset) {
    message.textContent = 'Đang kiểm tra liên kết…';
    try { await authRequest('reset', { token: resetToken, signal }); }
    catch (error) {
      if (signal.aborted) return;
      message.textContent = '';
      errorMessage.textContent = error.message;
      card.append(link('/forgot', 'Yêu cầu liên kết mới', 'button secondary'));
      return;
    }
    if (signal.aborted) return;
    message.textContent = '';
  }
  if (logout) card.append(el('p', {}, `Xác nhận đăng xuất khỏi tài khoản ${account.user.email}.`));

  const fields = el('fieldset', { className: 'auth-fields' });
  if (login || register || activate || forgot) fields.append(field('email', 'Email', {
    type: 'email', autocomplete: 'email', maxLength: 254, value: activate || login ? pendingEmail : ''
  }));
  if (login || register || reset) fields.append(field('password', 'Mật khẩu', {
    type: 'password', autocomplete: login ? 'current-password' : 'new-password',
    minLength: login ? undefined : 8, maxLength: 128
  }));
  if (register || reset) fields.append(field('confirmPassword', 'Xác nhận mật khẩu', {
    type: 'password', autocomplete: 'new-password', minLength: 8, maxLength: 128
  }));
  if (activate) fields.append(field('otp', 'Mã OTP', {
    type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}', maxLength: 6
  }));
  const captchaContainer = el('div');
  const submit = el('button', { type: 'submit' }, activate ? 'Xác minh OTP' : forgot ? 'Gửi liên kết' : reset ? 'Lưu mật khẩu mới' : title);
  const links = login ? [link('/register', 'Tạo tài khoản'), link('/forgot', 'Quên mật khẩu?'), link('/activate', 'Kích hoạt tài khoản')] :
    [link(logout ? '/admin/dishes' : '/login', logout ? 'Hủy đăng xuất' : 'Về đăng nhập')];
  const resend = activate ? el('button', { type: 'button', className: 'secondary', onClick: () => submitForm('activate/resend') }, 'Gửi lại OTP') : null;
  const form = el('form', { onSubmit(event) {
    event.preventDefault();
    submitForm(logout ? 'logout' : pathname.slice(1));
  } }, fields, captchaContainer, el('div', { className: 'actions' }, submit, resend));
  card.append(form, el('div', { className: 'auth-links' }, links));
  const captchaKey = account.recaptchaSiteKey;
  let captcha;
  let challengedEmail;
  let busy = false;
  function showCaptcha() {
    if (captcha) return;
    if (login) challengedEmail = form.elements.email.value.trim().toLowerCase();
    captcha = createCaptcha(captchaKey, signal);
    captchaContainer.append(captcha.element);
  }
  if (register) showCaptcha();
  if (login) form.elements.email.addEventListener('input', () => {
    if (captcha && challengedEmail !== form.elements.email.value.trim().toLowerCase()) {
      captcha.reset();
      captcha.element.remove();
      captcha = undefined;
    }
  });

  async function submitForm(action) {
    if (busy) return;
    if (action === 'activate/resend' && !form.elements.email.reportValidity()) return;
    message.textContent = '';
    errorMessage.textContent = '';
    for (const node of fields.querySelectorAll('.field-error')) node.textContent = '';
    const data = action === 'activate/resend' ? { email: form.elements.email.value } : Object.fromEntries(new FormData(form));
    if (captcha && !captcha.value()) {
      errorMessage.textContent = captchaKey ? 'Vui lòng hoàn thành reCAPTCHA.' : 'Dịch vụ reCAPTCHA chưa được cấu hình.';
      return;
    }
    if (captcha) data['g-recaptcha-response'] = captcha.value();
    if (reset) data.token = resetToken;
    busy = submit.disabled = fields.disabled = true;
    if (resend) resend.disabled = true;
    try {
      const result = await authRequest(action, { method: 'POST', data, signal });
      if (signal.aborted) return;
      if (login) {
        setAccount(result);
        navigate('/admin/dishes', { replace: true });
      } else if (register || action === 'activate') {
        pendingEmail = data.email;
        notice = result.notice;
        navigate(register ? '/activate' : '/login', { replace: true });
      } else if (logout || reset) {
        setAccount({ user: null });
        notice = result.notice;
        navigate('/login', { replace: true });
      } else {
        message.textContent = result.notice;
      }
    } catch (error) {
      if (signal.aborted) return;
      if (login && error.needsCaptcha) showCaptcha();
      errorMessage.textContent = error.message;
      for (const [name, text] of Object.entries(error.fields || {})) {
        const fieldError = fields.querySelector(`#${CSS.escape(name)}-error`);
        if (fieldError) fieldError.textContent = text;
      }
    } finally {
      if (!signal.aborted) captcha?.reset();
      busy = submit.disabled = fields.disabled = false;
      if (resend) resend.disabled = false;
    }
  }
}
