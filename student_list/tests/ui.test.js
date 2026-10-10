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
  const students = options.students || seed;
  const html = await ejs.renderFile(path.join(__dirname, '../views/students.ejs'), {
    students, summary: {
      total: students.length,
      withStudentId: students.filter(item => item.studentId).length,
      missingStudentId: students.filter(item => !item.studentId).length,
    },
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

test('Directory shows five records per page, searches all pages, and updates page-one story after create', async t => {
  const students = Array.from({ length: 12 }, (_, index) => {
    const id = 12 - index;
    return { id, studentId: String(24120000 + id), name: 'Sinh viên ' + id, email: 'student' + id + '@example.com' };
  });
  const createdStudent = { id: 13, studentId: '24127203', name: 'Lê Thu Hà', email: 'ha@example.com' };
  const ui = await fixture(t, {
    students,
    fetch: async () => json(201, { student: createdStudent, summary: { total: 13, withStudentId: 13, missingStudentId: 0 } }),
  });
  const visible = () => [...ui.document.querySelectorAll('.student-row:not([hidden])')].map(row => Number(row.dataset.recordId));
  const pager = ui.document.getElementById('directory-pagination');
  assert.deepEqual(visible(), [12, 11, 10, 9, 8]);
  assert.equal(ui.document.getElementById('student-list').dataset.storyPage, '1');
  assert.equal(ui.document.getElementById('page-status').textContent, 'Trang 1 / 3');
  pager.querySelector('[data-page="2"]').click();
  assert.deepEqual(visible(), [7, 6, 5, 4, 3]);
  assert.equal(ui.document.getElementById('student-list').dataset.storyPage, 'other');
  pager.querySelector('[data-page-step="1"]').click();
  assert.deepEqual(visible(), [2, 1]);
  assert.equal(ui.document.getElementById('page-status').textContent, 'Trang 3 / 3');
  const search = ui.document.getElementById('student-search');
  search.value = 'Sinh viên 6';
  search.dispatchEvent(new ui.window.Event('input'));
  assert.deepEqual(visible(), [6]);
  assert.equal(ui.document.getElementById('student-list').dataset.storyPage, 'other');
  assert.equal(pager.hidden, true);
  let story;
  ui.window.addEventListener('directory:page-one-changed', event => { story = event.detail.students; });
  fill(ui);
  send(ui);
  await tick();
  assert.deepEqual(visible(), [13, 12, 11, 10, 9]);
  assert.equal(ui.document.getElementById('student-list').dataset.storyPage, '1');
  assert.deepEqual(Array.from(story, item => Number(item.id)), [13, 12, 11, 10, 9]);
  assert.equal(story[0].name, 'Lê Thu Hà');
  assert.equal(story[0].initials, 'LH');
  assert.equal(ui.document.getElementById('page-status').textContent, 'Trang 1 / 3');
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
  assert.equal(ui.document.querySelector('.hero-actions'), null);
  assert.ok(ui.document.querySelector('.main-nav a[href="#student-list"]'));
  assert.equal(ui.document.querySelector('.main-nav a[href="#student-form"]'), null);
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
  const hero = ui.document.querySelector('.hero');
  const orbitStage = ui.document.querySelector('.orbit-stage');
  assert.equal(hero.style.getPropertyValue('--hero-copy-y'), '-28.0px');
  assert.equal(orbitStage.style.getPropertyValue('--orbit-stage-scale'), '0.900');
  Object.defineProperty(ui.window, 'scrollY', { value: 0, configurable: true });
  ui.window.dispatchEvent(new ui.window.Event('scroll'));
  ui.flush();
  assert.equal(hero.style.getPropertyValue('--hero-copy-y'), '0.0px');
  assert.equal(orbitStage.style.getPropertyValue('--orbit-stage-scale'), '1.000');
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

test('Bridge keeps a readable scene on reverse scroll and reduced motion', async t => {
  const ui = await fixture(t, { reduced: false });
  const bridge = ui.document.getElementById('journey');
  const words = [...bridge.querySelectorAll('.bridge-word')];
  assert.match(bridge.textContent, /Mỗi hồ sơ là một người/);
  let top = 720;
  bridge.getBoundingClientRect = () => ({ top, width: 900, height: 390 });
  ui.window.dispatchEvent(new ui.window.Event('scroll'));
  ui.flush();
  assert.equal(bridge.style.getPropertyValue('--bridge-first'), '0.000');
  assert.equal(bridge.style.getPropertyValue('--bridge-reveal'), '0.000');
  assert.equal(words[0].style.getPropertyValue('--word-opacity'), '1.000');
  top = 400;
  ui.window.dispatchEvent(new ui.window.Event('scroll'));
  ui.flush();
  assert.ok(Number(bridge.style.getPropertyValue('--bridge-reveal')) > 0);
  assert.ok(Number(bridge.style.getPropertyValue('--bridge-reveal')) < 1);
  assert.ok(Number(words[1].style.getPropertyValue('--word-opacity')) > .8);
  assert.equal(words[2].style.getPropertyValue('--word-opacity'), '0.000');
  top = 120;
  ui.window.dispatchEvent(new ui.window.Event('scroll'));
  ui.flush();
  assert.equal(bridge.style.getPropertyValue('--bridge-first'), '1.000');
  assert.equal(bridge.style.getPropertyValue('--bridge-reveal'), '1.000');
  assert.equal(bridge.style.getPropertyValue('--bridge-second'), '1.000');
  assert.equal(words[0].style.getPropertyValue('--word-opacity'), '0.000');
  assert.equal(words[2].style.getPropertyValue('--word-opacity'), '1.000');
  assert.notEqual(bridge.style.getPropertyValue('--beam-x'), '0.0px');
  top = 720;
  ui.window.dispatchEvent(new ui.window.Event('scroll'));
  ui.flush();
  assert.equal(bridge.style.getPropertyValue('--bridge-first'), '0.000');
  assert.equal(bridge.style.getPropertyValue('--bridge-reveal'), '0.000');
  assert.equal(words[0].style.getPropertyValue('--word-opacity'), '1.000');
  ui.preference('reduced', true);
  assert.equal(bridge.style.getPropertyValue('--bridge-first'), '');
  assert.equal(bridge.style.getPropertyValue('--bridge-reveal'), '');
  assert.equal(words[0].style.getPropertyValue('--word-opacity'), '');
  assert.equal(bridge.style.getPropertyValue('--beam-x'), '');
  assert.match(bridge.textContent, /Cùng nhau thành một lớp học/);
});

test('Scroll moves the scene selector in both directions and keeps reduced-motion navigation usable', async t => {
  const ui = await fixture(t, { reduced: false });
  const directory = ui.document.getElementById('student-list');
  const nav = ui.document.querySelector('.scene-nav');
  const overview = nav.querySelector('[data-scene-link="overview"]');
  const list = nav.querySelector('[data-scene-link="list"]');
  const dashboard = ui.document.querySelector('.dashboard');
  const tiles = [...dashboard.querySelectorAll('.stat-tile')];
  let dashboardTop = 900;
  dashboard.getBoundingClientRect = () => ({ top: dashboardTop, width: 900, height: 400 });
  let top = 900;
  directory.getBoundingClientRect = () => ({ top, width: 800, height: 500 });
  const scroll = () => { ui.window.dispatchEvent(new ui.window.Event('scroll')); ui.flush(); };
  scroll();
  assert.equal(nav.style.getPropertyValue('--scene-progress'), '0.000');
  assert.equal(overview.getAttribute('aria-current'), 'location');
  assert.equal(list.hasAttribute('aria-current'), false);
  assert.equal(tiles[0].style.getPropertyValue('--tile-x'), '-26.0px');
  dashboardTop = 0;
  top = 0;
  scroll();
  assert.equal(nav.style.getPropertyValue('--scene-progress'), '1.000');
  assert.equal(list.getAttribute('aria-current'), 'location');
  assert.equal(directory.style.getPropertyValue('--directory-opacity'), '1.000');
  assert.equal(tiles[0].style.getPropertyValue('--tile-x'), '0.0px');
  assert.equal(tiles[2].style.getPropertyValue('--tile-opacity'), '1.000');
  dashboardTop = 900;
  top = 900;
  scroll();
  assert.equal(nav.style.getPropertyValue('--scene-progress'), '0.000');
  assert.equal(overview.getAttribute('aria-current'), 'location');
  assert.equal(tiles[2].style.getPropertyValue('--tile-x'), '26.0px');
  ui.preference('reduced', true);
  top = 0;
  ui.window.dispatchEvent(new ui.window.Event('scroll'));
  assert.equal(list.getAttribute('aria-current'), 'location');
  assert.equal(directory.style.getPropertyValue('--directory-opacity'), '');
  assert.equal(tiles[0].style.getPropertyValue('--tile-x'), '');
  assert.equal(ui.frames.size, 0);
});

test('Quick preview works by hover, focus and tap, and closes with Escape', async t => {
  const ui = await fixture(t, { reduced: false });
  const card = ui.document.querySelector('.student-card');
  const panel = card.querySelector('.student-preview');
  const trigger = card.querySelector('.preview-trigger');
  assert.equal(panel.hidden, true);
  ui.pointer(card, 'pointerenter');
  assert.equal(panel.hidden, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  ui.pointer(card, 'pointerleave');
  assert.equal(panel.hidden, true);
  trigger.focus();
  assert.equal(panel.hidden, false);
  ui.document.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(panel.hidden, true);
  assert.equal(ui.document.activeElement, trigger);
  trigger.click();
  assert.equal(panel.hidden, false);
  let copied;
  Object.defineProperty(ui.window.navigator, 'clipboard', { value: { writeText: async value => { copied = value; } }, configurable: true });
  panel.querySelector('[data-copy-email]').click();
  await tick();
  assert.equal(copied, card.closest('.student-row').dataset.email);
  assert.equal(panel.querySelector('.preview-status').textContent, 'Đã sao chép email.');
  panel.querySelector('.preview-close').click();
  assert.equal(panel.hidden, true);
  trigger.click();
  ui.document.getElementById('student-search').value = 'unmatched';
  ui.document.getElementById('student-search').dispatchEvent(new ui.window.Event('input'));
  assert.equal(panel.hidden, true);
});

test('A newly saved record receives a working preview with its own actions', async t => {
  const ui = await fixture(t, { fetch: async () => json(201, { student, summary }) });
  fill(ui); send(ui); await tick();
  const row = ui.document.getElementById('student-rows').firstElementChild;
  const trigger = row.querySelector('.preview-trigger');
  const panel = row.querySelector('.student-preview');
  assert.equal(trigger.getAttribute('aria-controls'), panel.id);
  trigger.click();
  assert.equal(panel.hidden, false);
  assert.equal(panel.querySelector('[data-preview-name]').textContent, student.name);
  assert.equal(panel.querySelector('[data-preview-email]').textContent, student.email);
  assert.equal(panel.querySelectorAll('a').length, 1);
  assert.equal(panel.querySelector('[data-preview-send]').getAttribute('href'), 'mailto:' + encodeURIComponent(student.email));
});
test('Quick preview flips above a card near the viewport edge', async t => {
  const ui = await fixture(t, { reduced: false });
  const card = ui.document.querySelector('.student-card');
  const panel = card.querySelector('.student-preview');
  card.getBoundingClientRect = () => ({ top: 460, left: 0, width: 400, height: 100 });
  panel.getBoundingClientRect = () => ({ top: 680, bottom: 900, left: 0, width: 300, height: 220 });
  ui.pointer(card, 'pointerenter');
  assert.equal(panel.hidden, false);
  assert.ok(card.classList.contains('preview-above'));
  ui.pointer(card, 'pointerleave');
  assert.ok(!card.classList.contains('preview-above'));
});
