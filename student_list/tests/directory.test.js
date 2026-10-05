const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
const { normalize, matchesRecord, initials } = require('../public/app');

const seed = [
  { id: 1, name: 'Nguyễn Minh Anh', email: 'minhanh@example.com' },
  { id: 2, studentId: '24127202', name: 'Đặng Văn Bình', email: 'binh@example.com' },
  { id: 6, studentId: '24127203', name: 'Hà Mỹ Trần', email: 'ha@example.com' },
];
const valid = { studentId: '24127204', name: 'Nguyễn Mai Chi', email: 'chi@example.com' };

async function fixture(t, records = seed, options = {}) {
  let content = JSON.stringify(records);
  let writes = 0;
  const storage = {
    async readFile() {
      if (options.readError) throw new Error('private-read-detail');
      return options.corrupt ? '{invalid' : content;
    },
    async writeFile(file, data) {
      if (options.writeError) throw new Error('private-write-detail');
      if (options.writeDelay) await new Promise(resolve => setTimeout(resolve, options.writeDelay));
      content = data;
      writes++;
    },
  };
  const app = createApp({ storage, studentsFile: 'isolated-fixture.json', logRequests: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  return {
    get: (route = '/students', init) => fetch(base + route, init),
    post: (data = valid, json = true) => fetch(base + '/students', {
      method: 'POST', headers: { Accept: json ? 'application/json' : 'text/html' },
      body: new URLSearchParams(data), redirect: 'manual',
    }),
    data: () => JSON.parse(content),
    writes: () => writes,
  };
}

test('Root redirects to the real directory', async t => {
  const app = await fixture(t);
  const response = await app.get('/', { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/students');
});

for (const size of [0, 1, 30, 100]) {
  test('SSR renders ' + size + ' records with one usable native form', async t => {
    const records = Array.from({ length: size }, (_, i) => ({
      id: i + 1, name: i === 0 ? 'Nguyễn ' + 'Minh '.repeat(20) : 'Sinh viên ' + i,
      email: i === 0 ? 'long'.repeat(40) + '@example.com' : 'sv' + i + '@example.com',
      ...(i % 2 ? { studentId: String(24120000 + i) } : {}),
    }));
    const app = await fixture(t, records);
    const response = await app.get();
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal((html.match(/class="student-row/g) || []).length, size + 1); // includes inert template
    assert.ok(html.includes('method="POST" action="/students"'));
    assert.ok(html.includes('lang="vi"'));
    assert.ok(html.includes('Mã số sinh viên'));
    assert.ok(html.includes('id="directory-empty"' + (size ? ' hidden' : '>')));
    if (size > 1) assert.ok(html.indexOf('data-record-id="' + size + '"') < html.indexOf('data-record-id="1"'));
    assert.deepEqual(app.data(), records, 'Rendering must not reorder storage');
  });
}

test('JSON success happens after persistence, normalizes input and returns true summary', async t => {
  const app = await fixture(t, seed, { writeDelay: 25 });
  const response = await app.post({ studentId: ' 24127204 ', name: ' Nguyễn Mai Chi ', email: ' CHI@EXAMPLE.COM ' });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(body.student, { id: 7, studentId: '24127204', name: 'Nguyễn Mai Chi', email: 'chi@example.com' });
  assert.deepEqual(body.summary, { total: 4, withStudentId: 3, missingStudentId: 1 });
  assert.deepEqual(app.data(), seed.concat(body.student));
  assert.equal(app.writes(), 1);
});

test('First record receives ID 1', async t => {
  const app = await fixture(t, []);
  const response = await app.post();
  assert.equal((await response.json()).student.id, 1);
});

const invalidCases = [
  [{ studentId: '' }, 400, 'studentId'],
  [{ studentId: '123' }, 400, 'studentId'],
  [{ studentId: 'abcdefgh' }, 400, 'studentId'],
  [{ studentId: '24127202' }, 409, 'studentId'],
  [{ name: '' }, 400, 'name'],
  [{ name: 'ư' }, 400, 'name'],
  [{ name: 'a'.repeat(101) }, 400, 'name'],
  [{ name: 'Minh123' }, 400, 'name'],
  [{ email: '' }, 400, 'email'],
  [{ email: 'wrong' }, 400, 'email'],
  [{ email: 'a b@example.com' }, 400, 'email'],
  [{ email: 'BINH@EXAMPLE.COM' }, 409, 'email'],
];
for (let i = 0; i < invalidCases.length; i++) {
  const [changes, status, field] = invalidCases[i];
  test('Validation case ' + (i + 1) + ' reports the correct field without writing', async t => {
    const app = await fixture(t);
    const response = await app.post({ ...valid, ...changes });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.field, field);
    assert.equal(typeof body.error.message, 'string');
    assert.deepEqual(app.data(), seed);
    assert.equal(app.writes(), 0);
  });
}

test('Unicode names, apostrophes and hyphens keep existing acceptance rules', async t => {
  const app = await fixture(t);
  const response = await app.post({ ...valid, name: "Đặng O'Neil-Mỹ." });
  assert.equal(response.status, 201);
});

test('HTML validation keeps entered values and inline error', async t => {
  const app = await fixture(t);
  const response = await app.post({ ...valid, studentId: '24127202' }, false);
  assert.equal(response.status, 409);
  const html = await response.text();
  assert.ok(html.includes('value="24127202"'));
  assert.ok(html.includes('value="Nguyễn Mai Chi"'));
  assert.ok(html.includes('value="chi@example.com"'));
  assert.ok(html.includes('data-error-field="studentId"'));
  assert.ok(html.includes('aria-invalid=true'));
  assert.equal(app.writes(), 0);
});

test('HTML fallback redirects and marks the newly created student', async t => {
  const app = await fixture(t);
  const response = await app.post(valid, false);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/students?created=7#student-7');
  const html = await (await app.get('/students?created=7')).text();
  assert.ok(html.includes('data-created-id="7"'));
  assert.ok(html.includes('Đã thêm Nguyễn Mai Chi vào danh bạ.'));
  assert.ok(html.includes('class="student-row is-new"'));
  const invalid = await (await app.get('/students?created=999')).text();
  assert.ok(invalid.includes('data-created-id=""'));
});

test('Write failure never reports success and retains HTML form values', async t => {
  const app = await fixture(t, seed, { writeError: true });
  const json = await app.post();
  assert.equal(json.status, 500);
  const body = await json.json();
  assert.equal(body.error.field, null);
  assert.ok(!body.student);
  assert.ok(!JSON.stringify(body).includes('private-write-detail'));
  const htmlResponse = await app.post(valid, false);
  assert.equal(htmlResponse.status, 500);
  const html = await htmlResponse.text();
  assert.ok(html.includes('value="Nguyễn Mai Chi"'));
  assert.ok(html.includes('value="chi@example.com"'));
  assert.ok(!html.includes('private-write-detail'));
  assert.deepEqual(app.data(), seed);
});

for (const option of ['readError', 'corrupt']) {
  test('Unavailable directory (' + option + ') is distinct from empty directory', async t => {
    const app = await fixture(t, seed, { [option]: true });
    const response = await app.get();
    assert.equal(response.status, 500);
    const html = await response.text();
    assert.ok(html.includes('Danh bạ chưa sẵn sàng'));
    assert.ok(html.includes('id="directory-empty" hidden'));
    assert.ok(!html.includes('private-read-detail'));
    const post = await app.post();
    assert.equal(post.status, 500);
    assert.equal((await post.json()).error.field, null);
    assert.equal(app.writes(), 0);
  });
}

test('Overlapping duplicate requests write exactly one record', async t => {
  const app = await fixture(t, seed, { writeDelay: 30 });
  const responses = await Promise.all([app.post(), app.post()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  await Promise.all(responses.map(response => response.json()));
  assert.equal(app.data().length, 4);
  assert.equal(app.writes(), 1);
});

test('Overlapping distinct requests preserve both records with distinct IDs', async t => {
  const app = await fixture(t, seed, { writeDelay: 30 });
  const responses = await Promise.all([app.post(), app.post({ studentId: '24127205', name: 'Lê Minh Khang', email: 'khang@example.com' })]);
  assert.deepEqual(responses.map(response => response.status), [201, 201]);
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.deepEqual(bodies.map(body => body.student.id), [7, 8]);
  assert.equal(app.data().length, 5);
  assert.equal(app.writes(), 2);
});

test('Rendered legacy strings and validation inputs are escaped', async t => {
  const app = await fixture(t, [{ id: 1, name: '<script>alert(1)</script>', email: 'x@example.com' }]);
  const html = await (await app.get()).text();
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  const response = await app.post({ ...valid, name: '<img src=x onerror=alert(1)>' }, false);
  assert.equal(response.status, 400);
  const errorHtml = await response.text();
  assert.ok(!errorHtml.includes('value="<img'));
  assert.ok(errorHtml.includes('value="&lt;img'));
});

test('Persistence uses an isolated real JSON file, leaving the real directory unchanged', async t => {
  const realFile = path.join(__dirname, '../data/students.json');
  const before = await fs.readFile(realFile);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'academia-test-'));
  const filename = path.join(directory, 'students.json');
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await fs.unlink(filename);
    await fs.rmdir(directory);
    assert.deepEqual(await fs.readFile(realFile), before);
  });
  await fs.writeFile(filename, JSON.stringify(seed));
  server = createApp({ studentsFile: filename, logRequests: false }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/students', {
    method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(valid),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(JSON.parse(await fs.readFile(filename, 'utf8')), seed.concat(body.student));
});

test('Search matches accents, uppercase, đ, MSSV, email and combined terms', () => {
  assert.equal(normalize(' ĐẶNG VĂN BÌNH '), 'dang van binh');
  assert.ok(matchesRecord(seed[1], 'DANG binh', 'all'));
  assert.ok(matchesRecord(seed[1], '24127202', 'all'));
  assert.ok(matchesRecord(seed[1], 'BINH@EXAMPLE', 'all'));
  assert.ok(matchesRecord(seed[1], 'binh 24127202', 'all'));
  assert.equal(matchesRecord(seed[1], 'khong khop', 'all'), false);
  assert.equal(matchesRecord(seed[1], '', 'missing'), false);
  assert.ok(matchesRecord(seed[0], 'minh', 'missing'));
  assert.ok(matchesRecord({ ...seed[0], studentId: '  ' }, '', 'missing'));
});

test('Avatar initials support legacy short names and Vietnamese names', () => {
  assert.equal(initials('Nguyễn Minh Anh'), 'NA');
  assert.equal(initials('ư'), 'Ư');
  assert.equal(initials(''), '?');
});
