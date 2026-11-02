/* Client helpers improve the form; the server always checks CSRF and CAPTCHA. */
document.querySelectorAll('[data-password-toggle]').forEach(button => {
  const input = document.getElementById(button.getAttribute('aria-controls'));
  if (!input) return;
  const label = button.getAttribute('aria-label');
  button.hidden = false;
  button.addEventListener('click', () => {
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'Ẩn' : 'Hiện';
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', visible ? label.replace('Hiện', 'Ẩn') : label);
  });
});

document.querySelectorAll('form[data-captcha-v2]').forEach(form => {
  form.addEventListener('submit', event => {
    const message = form.querySelector('[data-captcha-message]');
    const proof = form.querySelector('[name="g-recaptcha-response"]');
    if (!proof?.value.trim()) {
      event.preventDefault();
      if (message) message.textContent = 'Vui lòng hoàn thành ô xác minh reCAPTCHA rồi thử lại.';
    }
  });
});
