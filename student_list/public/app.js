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
    const bridge = document.querySelector('.scene-bridge');
    const dashboard = document.querySelector('.dashboard');
    const directory = document.getElementById('student-list');
    const sceneNav = document.querySelector('.scene-nav');
    const sceneLinks = sceneNav ? sceneNav.querySelectorAll('[data-scene-link]') : [];
    const depth = document.querySelector('.hero-depth');
    const orbit = document.querySelector('.orbit-parallax');
    const orbitStage = document.querySelector('.orbit-stage');
    const bridgeWords = bridge ? bridge.querySelectorAll('.bridge-word') : [];
    const statTiles = dashboard ? dashboard.querySelectorAll('.stat-tile') : [];
    const light = document.querySelector('.cursor-light');
    const activeAnimations = new Set();
    const revealed = new WeakSet();
    const targetElements = new WeakSet();
    const targets = [];
    const ease = 'cubic-bezier(.22, 1, .36, 1)';
    const clamp = value => Math.max(0, Math.min(1, value));
    const smooth = (start, end, value) => {
      const t = clamp((value - start) / (end - start));
      return t * t * (3 - 2 * t);
    };
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
      // The WebGL scroll story already brings this panel out of the directory.
      if (element.classList.contains('form-panel') && document.body.classList.contains('has-webgl')) return;
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
    function updateSceneNavigation(directoryTop, dashboardTop) {
      if (!directory || !sceneNav) return;
      const viewport = window.innerHeight || 800;
      const start = viewport * .82;
      const end = viewport * .36;
      const progress = clamp((start - (directoryTop ?? directory.getBoundingClientRect().top)) / (start - end));
      sceneNav.style.setProperty('--scene-progress', progress.toFixed(3));
      const current = progress >= .5 ? 'list' : 'overview';
      for (const link of sceneLinks) {
        const active = link.dataset.sceneLink === current;
        link.classList.toggle('is-current', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
      if (reduced.matches) return;
      directory.style.setProperty('--directory-progress', progress.toFixed(3));
      directory.style.setProperty('--directory-y', ((1 - progress) * 26).toFixed(1) + 'px');
      directory.style.setProperty('--directory-opacity', (.55 + progress * .45).toFixed(3));
      if (dashboard) {
        const arrival = clamp((viewport * .88 - (dashboardTop ?? dashboard.getBoundingClientRect().top)) / (viewport * .38));
        dashboard.style.setProperty('--dashboard-y', ((1 - arrival) * 32).toFixed(1) + 'px');
        dashboard.style.setProperty('--dashboard-opacity', (.68 + arrival * .32).toFixed(3));
        for (let i = 0; i < statTiles.length; i++) {
          const progress = smooth(i * .14, .9, arrival);
          const distance = desktop.matches ? 26 : 12;
          statTiles[i].style.setProperty('--tile-x', ((i - 1) * distance * (1 - progress)).toFixed(1) + 'px');
          statTiles[i].style.setProperty('--tile-y', ((24 + i * 7) * (1 - progress)).toFixed(1) + 'px');
          statTiles[i].style.setProperty('--tile-opacity', (.78 + progress * .22).toFixed(3));
        }
      }
    }
    function render() {
      frame = null;
      // Batch geometry reads before writes and reuse bounds between events.
      if (hero && heroVisible && !heroBounds) {
        const bounds = hero.getBoundingClientRect();
        heroBounds = { top: bounds.top + scrollY, height: bounds.height };
      }
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (target.active && !target.focused && !target.bounds) target.bounds = target.element.getBoundingClientRect();
      }
      const bridgeBounds = bridge ? bridge.getBoundingClientRect() : null;
      const directoryTop = directory ? directory.getBoundingClientRect().top : null;
      const dashboardTop = dashboard ? dashboard.getBoundingClientRect().top : null;
      if (heroVisible && heroBounds) {
        const progress = clamp((scrollY - heroBounds.top) / Math.max(1, heroBounds.height));
        hero.style.setProperty('--hero-copy-y', (-progress * 28).toFixed(1) + 'px');
        hero.style.setProperty('--hero-copy-opacity', (1 - progress * .24).toFixed(3));
        if (orbitStage) {
          orbitStage.style.setProperty('--orbit-stage-x', (progress * 24).toFixed(1) + 'px');
          orbitStage.style.setProperty('--orbit-stage-y', (-progress * 18).toFixed(1) + 'px');
          orbitStage.style.setProperty('--orbit-stage-scale', (1 - progress * .1).toFixed(3));
        }
        if (desktop.matches) {
          if (depth) depth.style.transform = 'translate3d(0,' + progress * 32 + 'px,0)';
          if (orbit) orbit.style.transform = 'translate3d(0,' + progress * 56 + 'px,0)';
        }
      }
      if (bridge && bridgeBounds) {
        const viewport = window.innerHeight || 800;
        const progress = clamp((viewport * .85 - bridgeBounds.top) / (viewport * .65));
        const reveal = smooth(.04, .92, progress);
        const first = Math.max(0, Math.min(1, (progress - .08) / .42));
        const second = Math.max(0, Math.min(1, (progress - .34) / .48));
        const note = Math.max(0, Math.min(1, (progress - .58) / .34));
        bridge.style.setProperty('--bridge-thread', progress.toFixed(3));
        bridge.style.setProperty('--bridge-reveal', reveal.toFixed(3));
        bridge.style.setProperty('--bridge-first', first.toFixed(3));
        bridge.style.setProperty('--bridge-first-y', (1 - first) * 34 + 'px');
        bridge.style.setProperty('--bridge-second', second.toFixed(3));
        bridge.style.setProperty('--bridge-second-y', (1 - second) * 38 + 'px');
        bridge.style.setProperty('--bridge-note', note.toFixed(3));
        bridge.style.setProperty('--bridge-note-y', (1 - note) * 16 + 'px');
        bridge.style.setProperty('--bridge-count-y', (1 - progress) * -28 + 'px');
        bridge.style.setProperty('--bridge-count-scale', (.88 + progress * .12).toFixed(3));
        bridge.style.setProperty('--beam-x', (progress * bridgeBounds.width * .5).toFixed(1) + 'px');
        bridge.style.setProperty('--beam-opacity', (.25 + progress * .45).toFixed(3));
        const strengths = [
          1 - smooth(.16, .4, progress),
          smooth(.18, .43, progress) * (1 - smooth(.58, .82, progress)),
          smooth(.6, .84, progress),
        ];
        for (let i = 0; i < bridgeWords.length; i++) {
          const word = bridgeWords[i];
          word.style.setProperty('--word-opacity', strengths[i].toFixed(3));
          word.style.setProperty('--word-x', ((i === 0 ? -progress : i === 1 ? .5 - progress : 1 - progress) * 22).toFixed(1) + 'px');
          word.style.setProperty('--word-y', ((i === 0 ? -progress : i === 1 ? .5 - progress : 1 - progress) * 18).toFixed(1) + 'px');
        }
      }
      updateSceneNavigation(directoryTop, dashboardTop);
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
    window.addEventListener('resize', () => { invalidate(); if (reduced.matches) updateSceneNavigation(); }, { passive: true });
    window.addEventListener('scroll', () => { scrollY = window.scrollY; if (reduced.matches) updateSceneNavigation(); else schedule(); }, { passive: true, capture: true });

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
      if (bridge && reduced.matches) {
        for (const name of ['--bridge-thread', '--bridge-reveal', '--bridge-first', '--bridge-first-y', '--bridge-second', '--bridge-second-y', '--bridge-note', '--bridge-note-y', '--bridge-count-y', '--bridge-count-scale', '--beam-x', '--beam-opacity']) bridge.style.removeProperty(name);
        for (const word of bridgeWords) for (const name of ['--word-opacity', '--word-x', '--word-y']) word.style.removeProperty(name);
      }
      if (reduced.matches) {
        if (hero) for (const name of ['--hero-copy-y', '--hero-copy-opacity']) hero.style.removeProperty(name);
        if (orbitStage) for (const name of ['--orbit-stage-x', '--orbit-stage-y', '--orbit-stage-scale']) orbitStage.style.removeProperty(name);
        if (dashboard) for (const name of ['--dashboard-y', '--dashboard-opacity']) dashboard.style.removeProperty(name);
        for (const tile of statTiles) for (const name of ['--tile-x', '--tile-y', '--tile-opacity']) tile.style.removeProperty(name);
        if (directory) for (const name of ['--directory-progress', '--directory-y', '--directory-opacity']) directory.style.removeProperty(name);
        updateSceneNavigation();
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

    const skipIntro = Boolean(window.location.hash);
    if (!skipIntro) {
      animate(document.querySelector('.header-inner'), [{ opacity: .3, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], 300);
      const words = document.querySelectorAll('.title-word');
      for (let i = 0; i < words.length; i++) {
        animate(words[i], [{ opacity: 0, transform: 'translateY(36px) rotateX(-15deg)' }, { opacity: 1, transform: 'translateY(0) rotateX(0)' }], 650, 100 + i * 120);
      }
      animate(document.querySelector('.hero-visual'), [{ opacity: 0, transform: 'scale(.88) rotate(-6deg)' }, { opacity: 1, transform: 'scale(1) rotate(0)' }], 900, 250);
      animate(document.querySelector('.hero-description'), [{ opacity: .3, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 500, 300);
    }
    if (reduced.matches) updateSceneNavigation();
    else schedule();
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
  const pagination = document.getElementById('directory-pagination');
  const pageNumbers = document.getElementById('page-numbers');
  const pageStatus = document.getElementById('page-status');
  const directoryEmpty = document.getElementById('directory-empty');
  const directoryLoading = document.getElementById('directory-loading');
  const directoryUnavailable = document.getElementById('directory-unavailable');
  const searchEmpty = document.getElementById('search-empty');
  const feedback = document.getElementById('form-feedback');
  const feedbackText = feedback.querySelector('[data-feedback-text]');
  const reloadLink = feedback.querySelector('[data-feedback-reload]');
  const notice = document.getElementById('success-notice');
  const submit = form.querySelector('[type="submit"]');
  const submitLabel = submit.querySelector('[data-submit-label]');
  const fields = ['studentId', 'name', 'email'];
  const records = [];
  let filter = 'all';
  const pageSize = 5;
  let page = 1;
  let busy = false;
  let loaded = false;
  let successTimer;
  const motion = createMotion();
  const preview = createPreviews();

  function createPreviews() {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    let active = null;
    let restoringFocus = false;
    function hide(card) {
      if (!card) return;
      card.querySelector('.student-preview').hidden = true;
      card.querySelector('.preview-trigger').setAttribute('aria-expanded', 'false');
      card.classList.remove('preview-open');
      card.classList.remove('preview-above');
      card.closest('.student-row').classList.remove('is-preview-open');
      if (active === card) active = null;
    }
    function dismiss(restoreFocus = false) {
      if (!active) return;
      const trigger = active.querySelector('.preview-trigger');
      hide(active);
      if (restoreFocus) {
        restoringFocus = true;
        trigger.focus();
        restoringFocus = false;
      }
    }
    function show(card) {
      if (active && active !== card) hide(active);
      const panel = card.querySelector('.student-preview');
      if (!panel.hidden) return;
      panel.querySelector('.preview-status').textContent = '';
      panel.hidden = false;
      card.classList.remove('preview-above');
      if (fine.matches && window.innerWidth >= 768) {
        const panelBounds = panel.getBoundingClientRect();
        const roomAbove = panelBounds.top - card.offsetHeight + 5;
        if (panelBounds.bottom > window.innerHeight - 16 && roomAbove > panelBounds.height + 16) card.classList.add('preview-above');
      }
      card.querySelector('.preview-trigger').setAttribute('aria-expanded', 'true');
      card.classList.add('preview-open');
      card.closest('.student-row').classList.add('is-preview-open');
      active = card;
    }
    function register(row) {
      const card = row.querySelector('.student-card');
      const trigger = card.querySelector('.preview-trigger');
      const panel = card.querySelector('.student-preview');
      card.addEventListener('pointerenter', event => {
        if (fine.matches && event.pointerType !== 'touch') show(card);
      });
      card.addEventListener('pointerleave', () => {
        if (!card.contains(document.activeElement)) hide(card);
      });
      card.addEventListener('focusin', event => {
        if (!restoringFocus && event.target.closest('.preview-trigger, .student-preview')) show(card);
      });
      card.addEventListener('focusout', event => {
        if (!card.contains(event.relatedTarget)) hide(card);
      });
      trigger.addEventListener('click', () => show(card));
      panel.querySelector('.preview-close').addEventListener('click', () => dismiss(true));
      panel.querySelector('[data-copy-email]').addEventListener('click', async () => {
        const status = panel.querySelector('.preview-status');
        try {
          if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(row.dataset.email);
          status.classList.remove('is-error');
          status.textContent = 'Đã sao chép email.';
        } catch (error) {
          status.classList.add('is-error');
          status.textContent = 'Không thể sao chép. Hãy chọn email bên trên.';
        }
      });
    }
    document.addEventListener('pointerdown', event => {
      if (active && !active.contains(event.target)) hide(active);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && active) dismiss(true);
    });
    return { register, dismiss };
  }
  function applyFilters() {
    preview.dismiss();
    const matching = records.filter(record => matchesRecord(record, search.value, filter));
    const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
    page = Math.min(page, pageCount);
    document.getElementById('student-list').dataset.storyPage =
      page === 1 && !search.value.trim() && filter === 'all' && matching.length > 0 ? '1' : 'other';
    const start = (page - 1) * pageSize;
    const visible = new Set(matching.slice(start, start + pageSize));
    for (let i = 0; i < records.length; i++) {
      records[i].row.hidden = !visible.has(records[i]);
    }
    directoryEmpty.hidden = !loaded || records.length > 0;
    searchEmpty.hidden = !loaded || !records.length || matching.length > 0;
    if (loaded) resultCount.textContent = 'Hiển thị ' + visible.size + ' / ' + records.length + ' sinh viên';
    pagination.hidden = pageCount <= 1 || matching.length === 0;
    pageStatus.textContent = 'Trang ' + page + ' / ' + pageCount;
    pagination.querySelector('[data-page-step="-1"]').disabled = page === 1;
    pagination.querySelector('[data-page-step="1"]').disabled = page === pageCount;
    pageNumbers.replaceChildren();
    let previous = 0;
    const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
      .filter(number => number >= 1 && number <= pageCount).sort((a, b) => a - b);
    for (const number of pages) {
      if (previous && number - previous > 1) {
        const gap = document.createElement('span');
        gap.className = 'page-gap';
        gap.textContent = '…';
        gap.setAttribute('aria-hidden', 'true');
        pageNumbers.append(gap);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'page-number';
      button.dataset.page = String(number);
      button.textContent = String(number).padStart(2, '0');
      button.setAttribute('aria-label', 'Trang ' + number);
      if (number === page) {
        button.classList.add('is-current');
        button.setAttribute('aria-current', 'page');
      }
      pageNumbers.append(button);
      previous = number;
    }
    for (let i = 0; i < filters.length; i++) {
      const active = filters[i].dataset.filter === filter;
      filters[i].classList.toggle('is-active', active);
      filters[i].setAttribute('aria-pressed', String(active));
    }
    window.dispatchEvent(new Event('directory:state-changed'));
  }
  const tools = document.querySelector('.directory-tools');
  async function loadDirectory() {
    directoryLoading.hidden = false;
    directoryUnavailable.hidden = true;
    submit.disabled = true;
    try {
      if (typeof window.fetch !== 'function') throw new Error('Fetch unavailable');
      const response = await window.fetch('/api/students', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('Directory unavailable');
      const payload = await response.json();
      if (!Array.isArray(payload.students) || !payload.summary) throw new Error('Invalid directory response');
      const fragment = document.createDocumentFragment();
      records.length = 0;
      for (const student of payload.students) {
        const row = createRow(student);
        fragment.append(row);
        records.push({ row, name: student.name, studentId: student.studentId || '', email: student.email });
        motion.register(row);
        preview.register(row);
      }
      rows.replaceChildren(fragment);
      loaded = true;
      tools.hidden = false;
      directoryLoading.hidden = true;
      updateSummary(payload.summary);
      applyFilters();
      window.dispatchEvent(new CustomEvent('directory:page-one-changed', {
        detail: { students: records.slice(0, pageSize).map(record => ({
          id: record.row.dataset.recordId, name: record.name, studentId: record.studentId,
          initials: record.row.querySelector('.student-avatar')?.textContent.trim() || initials(record.name),
        })) },
      }));
      submit.disabled = false;
    } catch (error) {
      loaded = false;
      directoryLoading.hidden = true;
      directoryUnavailable.hidden = false;
      tools.hidden = true;
      resultCount.textContent = 'Chưa tải được danh sách.';
      document.querySelector('[data-record-count]').textContent = 'Chưa tải';
    }
  }
  document.getElementById('retry-directory').addEventListener('click', loadDirectory);
  loadDirectory();
  pagination.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const next = button.dataset.page ? Number(button.dataset.page) : page + Number(button.dataset.pageStep);
    if (!Number.isInteger(next) || next === page) return;
    page = next;
    applyFilters();
    if (button.dataset.page) pageNumbers.querySelector('[aria-current="page"]')?.focus();
    document.getElementById('student-list').scrollIntoView({
      behavior: motion.reduced.matches ? 'auto' : 'smooth', block: 'start',
    });
  });
  search.addEventListener('input', () => { page = 1; applyFilters(); });
  for (let i = 0; i < filters.length; i++) {
    filters[i].addEventListener('click', () => { filter = filters[i].dataset.filter; page = 1; applyFilters(); });
  }
  document.getElementById('reset-search').addEventListener('click', () => {
    search.value = '';
    filter = 'all';
    page = 1;
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
    row.querySelector('.preview-trigger').setAttribute('aria-controls', 'student-preview-' + student.id);
    row.querySelector('.preview-trigger').setAttribute('aria-label', 'Xem nhanh hồ sơ ' + student.name);
    const panel = row.querySelector('.student-preview');
    panel.id = 'student-preview-' + student.id;
    panel.setAttribute('aria-label', 'Thông tin nhanh của ' + student.name);
    row.querySelector('[data-preview-name]').textContent = student.name;
    row.querySelector('[data-preview-email]').textContent = student.email;
    row.querySelector('[data-preview-send]').href = 'mailto:' + encodeURIComponent(student.email);
    row.querySelector('[data-initials]').textContent = initials(student.name);
    row.querySelector('[data-name-label]').textContent = student.name;
    const code = row.querySelector('[data-code-label]');
    const hasId = String(student.studentId || '').trim().length > 0;
    code.textContent = hasId ? 'MSSV · ' + student.studentId : 'Chưa có MSSV';
    code.classList.toggle('is-missing', !hasId);
    row.querySelector('[data-preview-code]').textContent = code.textContent;
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

  form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!loaded || busy || !form.reportValidity()) return;
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
        const response = await window.fetch('/api/students', {
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
          page = 1;
          applyFilters();
          window.dispatchEvent(new CustomEvent('directory:page-one-changed', {
            detail: { students: records.slice(0, pageSize).map(record => ({
              id: record.row.dataset.recordId, name: record.name, studentId: record.studentId,
              initials: record.row.querySelector('.student-avatar')?.textContent.trim() || initials(record.name),
            })) },
          }));
          updateSummary(payload.summary);
          form.reset();
          submit.classList.remove('is-loading');
          submit.classList.add('is-success');
          submitLabel.textContent = 'Đã thêm sinh viên';
          notice.querySelector('[data-success-text]').textContent = 'Đã thêm ' + payload.student.name + ' vào danh bạ.';
          notice.hidden = false;
          motion.register(row, true);
          preview.register(row);
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
  window.addEventListener('pageshow', () => {
    if (!busy && loaded) {
      submit.disabled = false;
      form.removeAttribute('aria-busy');
      resetSubmit();
    }
  });
})();
