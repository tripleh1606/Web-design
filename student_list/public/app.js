(() => {
  'use strict';
  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
  }
  function matchesRecord(record, query, filter) {
    if (filter === 'missing' && String(record.studentId || '').trim()) return false;
    const haystack = normalize([record.name, record.studentId || '', record.email].join(' '));
    return normalize(query).split(/\s+/).every(word => haystack.includes(word));
  }
  function initials(name) {
    const words = String(name || '').trim().split(/\s+/);
    return (words.length > 1 ? words[0].charAt(0) + words[words.length - 1].charAt(0) : words[0].slice(0, 2)).toUpperCase() || '?';
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { normalize, matchesRecord, initials };
  if (typeof document === 'undefined') return;

  function createMotion() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const desktop = window.matchMedia('(min-width: 1024px)');
    const hero = document.querySelector('.hero');
    const depth = document.querySelector('.hero-depth');
    const orbit = document.querySelector('.orbit-parallax');
    const light = document.querySelector('.cursor-light');
    const activeAnimations = new Set();
    const revealed = new WeakSet();
    const targetElements = new WeakSet();
    const targets = [];
    const ease = 'cubic-bezier(.22, 1, .36, 1)';
    let frame = null;
    let pointerX = 0;
    let pointerY = 0;
    let pointerVisible = false;
    let heroVisible = true;
    let heroBounds = null;
    let scrollY = window.scrollY;

    function animate(element, keyframes, duration, delay = 0) {
      if (reduced.matches || !element || typeof element.animate !== 'function') return;
      const animation = element.animate(keyframes, { duration, delay, easing: ease, fill: 'backwards' });
      activeAnimations.add(animation);
      animation.finished.then(() => {
        activeAnimations.delete(animation);
        invalidate();
      }, () => activeAnimations.delete(animation));
      return animation;
    }
    function reveal(element, duration = 450, delay = 0) {
      revealed.add(element);
      animate(element, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], duration, delay);
    }
    const observer = typeof window.IntersectionObserver === 'function'
      ? new window.IntersectionObserver(entries => {
        let delay = 0;
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.isIntersecting && !revealed.has(entry.target)) {
            reveal(entry.target, 450, Math.min(delay, 210));
            observer.unobserve(entry.target);
            delay += 70;
          }
        }
      }, { threshold: .1 }) : null;

    function schedule() {
      if (frame === null && !document.hidden && !reduced.matches) frame = window.requestAnimationFrame(render);
    }
    function render() {
      frame = null;
      // Batch geometry reads before writes and reuse bounds between events.
      if (hero && desktop.matches && heroVisible && !heroBounds) {
        const bounds = hero.getBoundingClientRect();
        heroBounds = { top: bounds.top + scrollY, height: bounds.height };
      }
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (target.active && !target.focused && !target.bounds) target.bounds = target.element.getBoundingClientRect();
      }
      if (desktop.matches && heroVisible && heroBounds) {
        const progress = Math.max(0, Math.min(1, (scrollY - heroBounds.top) / Math.max(1, heroBounds.height)));
        if (depth) depth.style.transform = 'translate3d(0,' + progress * 32 + 'px,0)';
        if (orbit) orbit.style.transform = 'translate3d(0,' + progress * 56 + 'px,0)';
      }
      if (fine.matches && pointerVisible && light) {
        light.style.transform = 'translate3d(' + (pointerX - 270) + 'px,' + (pointerY - 270) + 'px,0)';
        document.body.classList.add('has-pointer');
      }
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (target.active && !target.focused && fine.matches) {
          const bounds = target.bounds;
          if (!bounds.width || !bounds.height) continue;
          const x = Math.max(0, Math.min(1, (pointerX - bounds.left) / bounds.width));
          const y = Math.max(0, Math.min(1, (pointerY - bounds.top) / bounds.height));
          target.element.style.setProperty('--rx', (3 - y * 6) + 'deg');
          target.element.style.setProperty('--ry', (x * 6 - 3) + 'deg');
        } else if (target.reset) {
          target.element.style.setProperty('--rx', '0deg');
          target.element.style.setProperty('--ry', '0deg');
        }
        target.reset = false;
      }
    }
    function invalidate() {
      heroBounds = null;
      for (let i = 0; i < targets.length; i++) targets[i].bounds = null;
      schedule();
    }
    function resetPointer() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      pointerVisible = false;
      document.body.classList.remove('has-pointer');
      if (light) light.style.removeProperty('transform');
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        window.clearTimeout(target.timer);
        target.active = false;
        target.reset = false;
        target.bounds = null;
        target.element.classList.remove('is-tilting');
        target.element.style.removeProperty('--rx');
        target.element.style.removeProperty('--ry');
      }
    }
    function register(element, alreadyVisible = false) {
      if (alreadyVisible) revealed.add(element);
      if (observer && !revealed.has(element)) observer.observe(element);
      const card = element.matches('[data-tilt-card]') ? element : element.querySelector('[data-tilt-card]');
      if (!card || targetElements.has(card)) return;
      targetElements.add(card);
      const target = { element: card, active: false, focused: card.matches(':focus-within'), bounds: null, reset: false, timer: null };
      targets.push(target);
      const cleanup = () => card.classList.remove('is-tilting');
      function settle() {
        target.reset = true;
        window.clearTimeout(target.timer);
        target.timer = window.setTimeout(cleanup, 320);
        schedule();
      }
      card.addEventListener('pointerenter', event => {
        if (reduced.matches || !fine.matches || event.pointerType === 'touch') return;
        window.clearTimeout(target.timer);
        target.active = true;
        target.bounds = null;
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerVisible = true;
        if (!target.focused) card.classList.add('is-tilting');
        schedule();
      }, { passive: true });
      card.addEventListener('pointerleave', () => { target.active = false; target.bounds = null; settle(); }, { passive: true });
      card.addEventListener('focusin', () => { target.focused = true; settle(); });
      card.addEventListener('focusout', event => {
        if (card.contains(event.relatedTarget)) return;
        target.focused = false;
        target.bounds = null;
        if (target.active && !reduced.matches && fine.matches) {
          window.clearTimeout(target.timer);
          card.classList.add('is-tilting');
          schedule();
        }
      });
    }
    document.querySelectorAll('[data-reveal]').forEach(element => register(element));
    document.addEventListener('pointermove', event => {
      if (reduced.matches || !fine.matches || event.pointerType === 'touch') return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerVisible = true;
      schedule();
    }, { passive: true });
    document.addEventListener('pointerout', event => { if (event.relatedTarget === null) resetPointer(); }, { passive: true });
    window.addEventListener('blur', resetPointer);
    window.addEventListener('resize', invalidate, { passive: true });
    window.addEventListener('scroll', () => { scrollY = window.scrollY; invalidate(); }, { passive: true, capture: true });

    function preferencesChanged() {
      resetPointer();
      if (reduced.matches) {
        for (const animation of activeAnimations) animation.cancel();
        activeAnimations.clear();
      }
      if (!desktop.matches || reduced.matches) {
        if (depth) depth.style.removeProperty('transform');
        if (orbit) orbit.style.removeProperty('transform');
      }
      invalidate();
    }
    reduced.addEventListener('change', preferencesChanged);
    fine.addEventListener('change', preferencesChanged);
    desktop.addEventListener('change', preferencesChanged);

    function visibilityChanged() {
      document.documentElement.classList.toggle('is-motion-paused', document.hidden);
      if (document.hidden) resetPointer();
      for (const animation of activeAnimations) {
        if (document.hidden && animation.playState === 'running') animation.pause();
        else if (!document.hidden && animation.playState === 'paused') animation.play();
      }
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    visibilityChanged();
    if (hero && typeof window.IntersectionObserver === 'function') {
      const heroObserver = new window.IntersectionObserver(entries => {
        heroVisible = entries[0].isIntersecting;
        hero.classList.toggle('is-motion-paused', !heroVisible);
        if (heroVisible) invalidate();
      });
      heroObserver.observe(hero);
    }

    const skipIntro = document.body.dataset.errorField || document.body.dataset.createdId ||
      document.querySelector('.directory-unavailable') || !document.getElementById('form-feedback').hidden || window.location.hash;
    if (!skipIntro) {
      animate(document.querySelector('.header-inner'), [{ opacity: .3, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], 300);
      const words = document.querySelectorAll('.title-word');
      for (let i = 0; i < words.length; i++) {
        animate(words[i], [{ opacity: 0, transform: 'translateY(36px) rotateX(-15deg)' }, { opacity: 1, transform: 'translateY(0) rotateX(0)' }], 650, 100 + i * 120);
      }
      animate(document.querySelector('.hero-visual'), [{ opacity: 0, transform: 'scale(.88) rotate(-6deg)' }, { opacity: 1, transform: 'scale(1) rotate(0)' }], 900, 250);
      animate(document.querySelector('.hero-description'), [{ opacity: .3, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 500, 300);
    }
    schedule();
    return {
      register,
      reveal,
      reduced,
      pulseNumbers() {
        document.querySelectorAll('.stat-number, .orbit-core strong').forEach(element =>
          animate(element, [{ opacity: .55, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], 240));
      },
    };
  }

  const form = document.querySelector('.student-form');
  const rows = document.getElementById('student-rows');
  const search = document.getElementById('student-search');
  const filters = document.querySelectorAll('[data-filter]');
  const resultCount = document.getElementById('result-count');
  const directoryEmpty = document.getElementById('directory-empty');
  const searchEmpty = document.getElementById('search-empty');
  const feedback = document.getElementById('form-feedback');
  const feedbackText = feedback.querySelector('[data-feedback-text]');
  const reloadLink = feedback.querySelector('[data-feedback-reload]');
  const notice = document.getElementById('success-notice');
  const submit = form.querySelector('[type="submit"]');
  const submitLabel = submit.querySelector('[data-submit-label]');
  const fields = ['studentId', 'name', 'email'];
  const records = Array.from(rows.querySelectorAll('.student-row'), row => ({
    row, name: row.dataset.name, studentId: row.dataset.studentId, email: row.dataset.email,
  }));
  let filter = 'all';
  let busy = false;
  let successTimer;
  const motion = createMotion();

  function applyFilters() {
    let shown = 0;
    for (let i = 0; i < records.length; i++) {
      const matches = matchesRecord(records[i], search.value, filter);
      records[i].row.hidden = !matches;
      if (matches) shown++;
    }
    directoryEmpty.hidden = records.length > 0 || !!document.querySelector('.directory-unavailable');
    searchEmpty.hidden = !records.length || shown > 0;
    if (!document.querySelector('.directory-unavailable')) {
      resultCount.textContent = 'Hiển thị ' + shown + ' / ' + records.length + ' sinh viên';
    }
    for (let i = 0; i < filters.length; i++) {
      const active = filters[i].dataset.filter === filter;
      filters[i].classList.toggle('is-active', active);
      filters[i].setAttribute('aria-pressed', String(active));
    }
  }
  const tools = document.querySelector('.directory-tools');
  if (!document.querySelector('.directory-unavailable')) tools.hidden = false;
  search.addEventListener('input', applyFilters);
  for (let i = 0; i < filters.length; i++) {
    filters[i].addEventListener('click', () => { filter = filters[i].dataset.filter; applyFilters(); });
  }
  document.getElementById('reset-search').addEventListener('click', () => {
    search.value = '';
    filter = 'all';
    applyFilters();
    search.focus();
  });

  function clearErrors() {
    feedback.hidden = true;
    reloadLink.hidden = true;
    for (const field of fields) {
      form.elements[field].removeAttribute('aria-invalid');
      document.getElementById(field + '-error').hidden = true;
    }
  }
  function showError(field, message, uncertain = false) {
    if (fields.includes(field)) {
      const input = form.elements[field];
      input.setAttribute('aria-invalid', 'true');
      const error = document.getElementById(field + '-error');
      error.textContent = message;
      error.hidden = false;
      input.focus();
    } else {
      feedbackText.textContent = message;
      reloadLink.hidden = !uncertain;
      feedback.hidden = false;
      feedback.focus();
    }
  }
  function resetSubmit() {
    window.clearTimeout(successTimer);
    submit.classList.remove('is-loading', 'is-success');
    submitLabel.textContent = 'Thêm vào danh bạ';
  }
  function updateSummary(summary) {
    for (const [selector, value] of [
      ['[data-total]', summary.total],
      ['[data-with-id]', summary.withStudentId],
      ['[data-missing-id]', summary.missingStudentId],
    ]) document.querySelectorAll(selector).forEach(element => { element.textContent = String(value).padStart(2, '0'); });
    document.querySelector('[data-record-count]').textContent = records.length + ' hồ sơ';
    document.querySelector('[data-filter-count]').textContent = String(summary.missingStudentId);
    motion.pulseNumbers();
  }
  function createRow(student) {
    const row = document.getElementById('student-card-template').content.firstElementChild.cloneNode(true);
    row.dataset.recordId = String(student.id);
    row.dataset.name = student.name;
    row.dataset.studentId = student.studentId || '';
    row.dataset.email = student.email;
    const card = row.querySelector('.student-card');
    card.id = 'student-' + student.id;
    row.querySelector('[data-initials]').textContent = initials(student.name);
    row.querySelector('[data-name-label]').textContent = student.name;
    const code = row.querySelector('[data-code-label]');
    const hasId = String(student.studentId || '').trim().length > 0;
    code.textContent = hasId ? 'MSSV · ' + student.studentId : 'Chưa có MSSV';
    code.classList.toggle('is-missing', !hasId);
    row.querySelector('[data-email-label]').textContent = student.email;
    row.querySelector('[data-email-link]').href = 'mailto:' + encodeURIComponent(student.email);
    const number = row.querySelector('[data-record-label]');
    number.textContent = '#' + String(student.id).padStart(3, '0');
    number.setAttribute('aria-label', 'Số hồ sơ ' + student.id);
    return row;
  }
  function highlight(row) {
    row.classList.add('is-new');
    window.setTimeout(() => row.classList.remove('is-new'), 1200);
  }

  for (const field of fields) {
    const input = form.elements[field];
    input.addEventListener('input', () => {
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
      document.getElementById(field + '-error').hidden = true;
      if (!busy) resetSubmit();
    });
    input.addEventListener('invalid', () => {
      const validity = input.validity;
      let message = 'Vui lòng kiểm tra lại thông tin.';
      if (validity.valueMissing) message = field === 'studentId' ? 'Vui lòng nhập mã số sinh viên.' : field === 'name' ? 'Vui lòng nhập họ tên.' : 'Vui lòng nhập email.';
      else if (validity.patternMismatch) message = 'Mã số sinh viên phải gồm đúng 8 chữ số.';
      else if (validity.tooShort) message = 'Họ tên phải có ít nhất 2 ký tự.';
      else if (validity.typeMismatch) message = 'Vui lòng nhập một địa chỉ email hợp lệ.';
      input.setCustomValidity(message);
    });
  }

  if (typeof window.fetch === 'function') {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      busy = true;
      resetSubmit();
      clearErrors();
      submit.disabled = true;
      submit.classList.add('is-loading');
      submitLabel.textContent = 'Đang lưu…';
      form.setAttribute('aria-busy', 'true');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const body = new URLSearchParams(new FormData(form));
        const response = await window.fetch('/students', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body,
          signal: controller.signal,
        });
        const payload = await response.json();
        if (response.status === 201 && payload.student && payload.summary && typeof payload.student.id === 'number') {
          const row = createRow(payload.student);
          rows.prepend(row);
          records.unshift({ row, ...payload.student });
          search.value = '';
          filter = 'all';
          applyFilters();
          updateSummary(payload.summary);
          form.reset();
          submit.classList.remove('is-loading');
          submit.classList.add('is-success');
          submitLabel.textContent = 'Đã thêm sinh viên';
          notice.querySelector('[data-success-text]').textContent = 'Đã thêm ' + payload.student.name + ' vào danh bạ.';
          notice.hidden = false;
          motion.register(row, true);
          motion.reveal(row, 400);
          highlight(row);
          row.querySelector('.student-card').focus({ preventScroll: true });
          row.scrollIntoView({ behavior: motion.reduced.matches ? 'auto' : 'smooth', block: 'nearest' });
          successTimer = window.setTimeout(resetSubmit, 1800);
        } else if (!response.ok && payload.error && typeof payload.error.message === 'string') {
          showError(payload.error.field, payload.error.message);
        } else throw new Error('Unconfirmed response');
      } catch (error) {
        showError(null, 'Chưa xác nhận được kết quả lưu. Hãy tải lại danh bạ để kiểm tra trước khi gửi tiếp.', true);
      } finally {
        window.clearTimeout(timeout);
        busy = false;
        submit.disabled = false;
        submit.classList.remove('is-loading');
        form.removeAttribute('aria-busy');
        if (!submit.classList.contains('is-success')) submitLabel.textContent = 'Thêm vào danh bạ';
      }
    });
  }
  window.addEventListener('pageshow', () => {
    if (!busy && !document.querySelector('.directory-unavailable')) {
      submit.disabled = false;
      form.removeAttribute('aria-busy');
      resetSubmit();
    }
  });
  const created = document.body.dataset.createdId;
  if (created) {
    const row = records.find(record => record.row.dataset.recordId === created);
    if (row) {
      highlight(row.row);
      row.row.querySelector('.student-card').focus({ preventScroll: true });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('created');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  const initialError = document.body.dataset.errorField;
  if (fields.includes(initialError)) form.elements[initialError].focus();
  else if (!feedback.hidden) feedback.focus();
})();
