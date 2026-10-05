const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM, VirtualConsole } = require('jsdom');
const cssTree = require('css-tree');

const script = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');
const seed = [
  { id: 2, studentId: '24127202', name: 'Đặng Văn Bình', email: 'binh@example.com' },
  { id: 1, name: 'Nguyễn Minh Anh', email: 'minhanh@example.com' },
];
const student = { id: 3, studentId: '24127203', name: 'Lê Thu Hà', email: 'ha@example.com' };
const summary = { total: 3, withStudentId: 2, missingStudentId: 1 };
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, options = {}) {
  const html = await ejs.renderFile(path.join(__dirname, '../views/students.ejs'), {
    students: seed, summary: { total: 2, withStudentId: 1, missingStudentId: 1 },
    error: null, errorField: null, formValues: { studentId: '', name: '', email: '' },
    createdStudentId: null, directoryUnavailable: false,
  });
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, { url: 'http://localhost:3000/students', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  t.after(() => { dom.window.close(); assert.deepEqual(errors, []); });
  const { window } = dom;
  const media = new Map();
  window.matchMedia = query => {
    if (!media.has(query)) {
      const state = new window.EventTarget();
      state.matches = query.includes('reduced') ? options.reduced !== false : query.includes('min-width') ? (options.width || 1440) >= 1024 : true;
      state.media = query;
      media.set(query, state);
    }
    return media.get(query);
  };
  const frames = new Map();
  let frameId = 0;
  window.requestAnimationFrame = handler => { frames.set(++frameId, handler); return frameId; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const animations = [];
  window.Element.prototype.animate = function(keyframes, settings) {
    let resolve;
    const animation = { element: this, keyframes, settings, playState: 'running', finished: new Promise(done => { resolve = done; }),
      cancel() { this.playState = 'idle'; resolve(); },
      pause() { this.playState = 'paused'; },
      play() { this.playState = 'running'; },
    };
    animations.push(animation);
    return animation;
  };
  window.Element.prototype.scrollIntoView = function() {};
  const observers = [];
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(element) { this.targets.add(element); }
    unobserve(element) { this.targets.delete(element); }
  };
  window.fetch = options.fetch;
  let hidden = false;
  Object.defineProperty(window.document, 'hidden', { get: () => hidden });
  const reads = new Map();
  window.Element.prototype.getBoundingClientRect = function() {
    reads.set(this, (reads.get(this) || 0) + 1);
    return { top: this.classList.contains('hero') ? 100 : 0, left: 0, width: 200, height: this.classList.contains('hero') ? 640 : 100 };
  };
  window.eval(script);
  await tick();
  function flush() { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(0); }
  function preference(fragment, value) { const state = [...media.values()].find(item => item.media.includes(fragment)); state.matches = value; state.dispatchEvent(new window.Event('change')); }
  function pointer(element, type, x = 150) {
    const event = new window.Event(type);
    Object.defineProperties(event, { pointerType: { value: 'mouse' }, clientX: { value: x }, clientY: { value: 25 }, relatedTarget: { value: null } });
    element.dispatchEvent(event);
  }
  return {
    window, document: window.document, frames, animations, observers, reads, flush, preference, pointer,
    visibility(value) { hidden = value; window.document.dispatchEvent(new window.Event('visibilitychange')); },
  };
}
function fill(ui) {
  for (const [field, value] of Object.entries({ studentId: '24127203', name: 'Lê Thu Hà', email: 'ha@example.com' })) {
    const input = ui.document.getElementById(field);
    input.value = value;
    input.dispatchEvent(new ui.window.Event('input'));
  }
}
function send(ui) {
  return ui.document.querySelector('form').dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }));
}
function json(status, body) { return { status, ok: status >= 200 && status < 300, json: async () => body }; }

test('Actual UI combines Vietnamese search and missing-ID filter without changing totals', async t => {
  const ui = await fixture(t);
  const input = ui.document.getElementById('student-search');
  assert.equal(ui.document.querySelector('.directory-tools').hidden, false);
  input.value = 'DANG binh';
  input.dispatchEvent(new ui.window.Event('input'));
  assert.equal(ui.document.querySelectorAll('.student-row:not([hidden])').length, 1);
  assert.equal(ui.document.getElementById('result-count').textContent, 'Hiển thị 1 / 2 sinh viên');
  ui.document.querySelector('[data-filter="missing"]').click();
  assert.equal(ui.document.getElementById('search-empty').hidden, false);
  assert.equal(ui.document.getElementById('directory-empty').hidden, true);
  assert.equal(ui.document.querySelector('.stat-number[data-total]').textContent, '02');
  ui.document.getElementById('reset-search').click();
  assert.equal(input.value, '');
  assert.equal(ui.document.querySelectorAll('.student-row:not([hidden])').length, 2);
  assert.equal(ui.document.activeElement, input);
});

test('Pending submission is locked, submits the expected contract once, and waits for confirmation', async t => {
  let resolve;
  let calls = 0;
  const ui = await fixture(t, { fetch: (url, options) => {
    calls++;
    assert.equal(url, '/students');
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
    assert.equal(options.body.get('studentId'), '24127203');
    return new Promise(done => { resolve = done; });
  } });
  fill(ui);
  send(ui);
  send(ui);
  const button = ui.document.querySelector('[type="submit"]');
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(ui.document.querySelector('[data-submit-label]').textContent, 'Đang lưu…');
  assert.equal(ui.document.querySelectorAll('.student-row').length, 2);
  assert.equal(ui.document.getElementById('success-notice').hidden, true);
  resolve(json(201, { student, summary }));
  await tick();
  assert.equal(button.disabled, false);
  assert.equal(ui.document.querySelector('[data-submit-label]').textContent, 'Đã thêm sinh viên');
  assert.equal(ui.document.getElementById('student-rows').firstElementChild.dataset.recordId, '3');
  assert.equal(ui.document.getElementById('name').value, '');
  assert.equal(ui.document.querySelector('.stat-number[data-total]').textContent, '03');
  assert.equal(ui.document.querySelector('[data-with-id]').textContent, '02');
  assert.equal(ui.document.querySelector('[data-missing-id]').textContent, '01');
  assert.equal(ui.document.getElementById('success-notice').hidden, false);
  assert.equal(ui.document.activeElement.id, 'student-3');
});

test('Successful save resets active search/filter and exposes the new record', async t => {
  const ui = await fixture(t, { fetch: async () => json(201, { student, summary }) });
  ui.document.getElementById('student-search').value = 'does not match';
  ui.document.querySelector('[data-filter="missing"]').click();
  fill(ui);
  send(ui);
  await tick();
  assert.equal(ui.document.getElementById('student-search').value, '');
  assert.equal(ui.document.querySelector('[data-filter="all"]').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.document.querySelectorAll('.student-row:not([hidden])').length, 3);
  assert.equal(ui.document.getElementById('result-count').textContent, 'Hiển thị 3 / 3 sinh viên');
});

test('Server field error keeps values, marks field and moves focus', async t => {
  const ui = await fixture(t, { fetch: async () => json(409, { error: { field: 'email', message: 'Email này đã có trong danh bạ.' } }) });
  fill(ui); send(ui); await tick();
  assert.equal(ui.document.getElementById('name').value, 'Lê Thu Hà');
  assert.equal(ui.document.getElementById('email').value, 'ha@example.com');
  assert.equal(ui.document.getElementById('email').getAttribute('aria-invalid'), 'true');
  assert.equal(ui.document.getElementById('email-error').hidden, false);
  assert.equal(ui.document.activeElement.id, 'email');
  assert.equal(ui.document.querySelector('[type="submit"]').disabled, false);
  assert.equal(ui.document.getElementById('success-notice').hidden, true);
});

for (const mode of ['network', 'unconfirmed', 'write']) {
  test('Failure (' + mode + ') preserves input and never signals success', async t => {
    const ui = await fixture(t, { fetch: async () => {
      if (mode === 'network') throw new Error('Disconnected');
      return mode === 'write' ? json(500, { error: { field: null, message: 'Không thể lưu hồ sơ lúc này.' } }) : json(200, {});
    } });
    fill(ui); send(ui); await tick();
    assert.equal(ui.document.getElementById('name').value, 'Lê Thu Hà');
    assert.equal(ui.document.getElementById('email').value, 'ha@example.com');
    assert.equal(ui.document.getElementById('form-feedback').hidden, false);
    assert.equal(ui.document.getElementById('success-notice').hidden, true);
    assert.equal(ui.document.querySelector('[type="submit"]').disabled, false);
    assert.equal(ui.document.querySelector('[data-feedback-reload]').hidden, mode === 'write');
    assert.equal(ui.document.querySelectorAll('.student-row').length, 2);
  });
}

test('Native invalid form never sends fetch and shows Vietnamese validation', async t => {
  let calls = 0;
  const ui = await fixture(t, { fetch: async () => { calls++; } });
  send(ui); await tick();
  assert.equal(calls, 0);
  assert.equal(ui.document.getElementById('studentId').validationMessage, 'Vui lòng nhập mã số sinh viên.');
});

test('Browser without fetch retains native HTML submit behavior', async t => {
  const ui = await fixture(t);
  fill(ui);
  assert.equal(send(ui), true);
  assert.equal(ui.document.querySelector('form').getAttribute('method'), 'POST');
  assert.equal(ui.document.querySelector('form').getAttribute('action'), '/students');
});

test('Inserted record data uses text nodes instead of executable HTML', async t => {
  const malicious = { ...student, name: '<img src=x onerror=alert(1)>' };
  const ui = await fixture(t, { fetch: async () => json(201, { student: malicious, summary }) });
  fill(ui); send(ui); await tick();
  const card = ui.document.getElementById('student-3');
  assert.equal(card.querySelector('h3').textContent, malicious.name);
  assert.equal(card.querySelectorAll('img').length, 0);
});

test('Cinematic intro completes by 1200ms and controls stay enabled', async t => {
  const ui = await fixture(t, { reduced: false });
  const intro = ui.animations.filter(animation => animation.element.matches('.title-word, .hero-visual, .header-inner, .hero-description'));
  assert.equal(intro.length, 5);
  assert.ok(intro.every(animation => animation.settings.duration + animation.settings.delay <= 1200));
  assert.ok(intro.every(animation => animation.settings.fill === 'backwards'));
  assert.equal(ui.document.querySelectorAll('.hero-actions a[href]').length, 2);
  assert.equal(ui.document.querySelector('[type="submit"]').disabled, false);
});

test('Pointer storms share one frame and cached bounds; focus holds the card steady', async t => {
  const ui = await fixture(t, { reduced: false });
  ui.flush();
  const card = ui.document.querySelector('.student-card');
  ui.pointer(card, 'pointerenter');
  for (let i = 0; i < 100; i++) ui.pointer(ui.document, 'pointermove', i);
  assert.equal(ui.frames.size, 1);
  ui.flush();
  assert.equal(ui.reads.get(card), 1);
  for (let i = 0; i < 5; i++) { ui.pointer(ui.document, 'pointermove'); ui.flush(); }
  assert.equal(ui.reads.get(card), 1);
  assert.equal(ui.document.documentElement.style.length, 0);
  card.querySelector('a').focus();
  ui.flush();
  assert.equal(card.style.getPropertyValue('--rx'), '0deg');
});

test('Parallax stays within 32/56px, disables on mobile, and live reduced motion cancels effects', async t => {
  const ui = await fixture(t, { reduced: false });
  ui.flush();
  Object.defineProperty(ui.window, 'scrollY', { value: 740, configurable: true });
  ui.window.dispatchEvent(new ui.window.Event('scroll'));
  ui.flush();
  assert.equal(ui.document.querySelector('.hero-depth').style.transform, 'translate3d(0,32px,0)');
  assert.equal(ui.document.querySelector('.orbit-parallax').style.transform, 'translate3d(0,56px,0)');
  ui.preference('min-width', false);
  assert.equal(ui.document.querySelector('.hero-depth').style.transform, '');
  assert.equal(ui.document.querySelector('.orbit-parallax').style.transform, '');
  ui.preference('reduced', true);
  assert.equal(ui.frames.size, 0);
  assert.ok(ui.animations.every(animation => animation.playState === 'idle'));
  ui.pointer(ui.document, 'pointermove');
  assert.equal(ui.frames.size, 0);
});

test('Hidden tab and offscreen hero pause ambient motion; reveal triggers only once', async t => {
  const ui = await fixture(t, { reduced: false });
  ui.visibility(true);
  assert.ok(ui.document.documentElement.classList.contains('is-motion-paused'));
  assert.ok(ui.animations.every(animation => animation.playState === 'paused'));
  ui.visibility(false);
  assert.ok(!ui.document.documentElement.classList.contains('is-motion-paused'));
  const heroObserver = ui.observers.find(observer => [...observer.targets].some(element => element.classList.contains('hero')));
  const hero = ui.document.querySelector('.hero');
  heroObserver.callback([{ target: hero, isIntersecting: false }]);
  assert.ok(hero.classList.contains('is-motion-paused'));
  heroObserver.callback([{ target: hero, isIntersecting: true }]);
  assert.ok(!hero.classList.contains('is-motion-paused'));
  const revealObserver = ui.observers.find(observer => observer !== heroObserver);
  const target = [...revealObserver.targets][0];
  const before = ui.animations.length;
  revealObserver.callback([{ target, isIntersecting: true }]);
  revealObserver.callback([{ target, isIntersecting: true }]);
  assert.equal(ui.animations.length, before + 1);
});

test('Full stylesheet parses, rendered IDs are unique and every input has a label', async t => {
  const errors = [];
  const ast = cssTree.parse(css, { onParseError: error => errors.push(error.message) });
  assert.deepEqual(errors, []);
  assert.ok(ast.children.size > 100);
  const ui = await fixture(t);
  const ids = [...ui.document.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const input of ui.document.querySelectorAll('input')) {
    assert.ok(ui.document.querySelector('label[for="' + input.id + '"]'));
    for (const id of (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)) {
      assert.ok(ui.document.getElementById(id));
    }
  }
});
