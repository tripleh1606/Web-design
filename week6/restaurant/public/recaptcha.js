document.querySelectorAll('form[data-captcha-action]').forEach(form => {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.submitting === 'true') return;
    form.dataset.submitting = 'true';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const error = form.querySelector('[data-captcha-error]');
    error.hidden = true;
    try {
      if (!window.grecaptcha || !form.dataset.captchaSiteKey) throw new Error('CAPTCHA unavailable');
      await new Promise(resolve => window.grecaptcha.ready(resolve));
      const token = await window.grecaptcha.execute(form.dataset.captchaSiteKey, { action: form.dataset.captchaAction });
      if (!token) throw new Error('CAPTCHA unavailable');
      form.querySelector('[name="g-recaptcha-response"]').value = token;
      HTMLFormElement.prototype.submit.call(form);
    } catch {
      error.hidden = false;
      button.disabled = false;
      form.dataset.submitting = 'false';
    }
  });
});
