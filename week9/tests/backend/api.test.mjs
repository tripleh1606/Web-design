import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture, sourcePhoto, sampleVariants } from './helpers.mjs';

test('public reads paginate published photos with safe media URLs and no private fields', async t => {
  const f = await fixture(t);
  const first = await f.publish(sourcePhoto, sampleVariants);
  const second = await f.publish({ ...sourcePhoto, title: '<script>alert(1)</script>' }, sampleVariants);
  const hidden = await f.publish(sourcePhoto, sampleVariants);
  await f.repository.withLock(() => f.repository.beginDelete(hidden));
  const response = await f.request('/api/photos?page=1&limit=1');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const page = await response.json();
  assert.equal(page.total, 2); assert.equal(page.page, 1); assert.equal(page.limit, 1); assert.equal(page.items.length, 1);
  const next = await (await f.request('/api/photos?page=2&limit=1')).json();
  assert.notEqual(page.items[0].id, next.items[0].id);
  assert.deepEqual(new Set([page.items[0].id, next.items[0].id]), new Set([first, second]));
  assert.deepEqual((await (await f.request('/api/photos?page=3&limit=1')).json()).items, []);
  const detail = await (await f.request(`/api/photos/${second}`)).json();
  assert.equal(detail.photo.title, '<script>alert(1)</script>');
  assert.equal(detail.photo.variants[0].url, `/media/${second}/320.webp`);
  assert.equal(Object.hasOwn(detail.photo, 'published'), false);
  assert.equal(Object.hasOwn(detail.photo.variants[0], 'key'), false);
  assert.equal((await f.request(`/api/photos/${hidden}`)).status, 404);
  assert.equal((await f.request('/api/photos/missing')).status, 404);
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1&page=2', 'limit=101', 'limit=no', 'page=1000001', 'unknown=1']) assert.equal((await f.request(`/api/photos?${query}`)).status, 400, query);
});

test('capability login, hashed persistent session, rotation, expiry and logout', async t => {
  const f = await fixture(t);
  assert.deepEqual(await (await f.request('/api/manage/session')).json(), { authenticated: false });
  const badLogin = await f.request('/api/manage/session', { method: 'POST', headers: { Origin: f.config.publicOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ capability: 'wrong' }) });
  assert.equal(badLogin.status, 401);
  const login = await f.login();
  assert.match(login.header, /HttpOnly/i); assert.match(login.header, /SameSite=Strict/i); assert.match(login.header, /Path=\//i); assert.doesNotMatch(login.header, /Secure/i);
  const rawToken = login.cookie.split('=')[1];
  const rows = f.sql(db => db.prepare('SELECT * FROM manager_sessions').all());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, createHash('sha256').update(rawToken).digest('hex'));
  assert.ok(!JSON.stringify(rows).includes(f.config.capability));
  await f.restart();
  assert.deepEqual(await (await f.request('/api/manage/session', { headers: { Cookie: login.cookie } })).json(), { authenticated: true });
  const rotate = await f.request('/api/manage/session', { method: 'POST', headers: { Origin: f.config.publicOrigin, Cookie: login.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ capability: f.config.capability }) });
  const newCookie = rotate.headers.get('set-cookie').split(';')[0];
  assert.notEqual(newCookie, login.cookie);
  assert.equal((await (await f.request('/api/manage/session', { headers: { Cookie: login.cookie } })).json()).authenticated, false);
  const logout = await f.request('/api/manage/session', { method: 'DELETE', headers: { Origin: f.config.publicOrigin, Cookie: newCookie } });
  assert.equal(logout.status, 204); assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
  assert.equal((await (await f.request('/api/manage/session', { headers: { Cookie: newCookie } })).json()).authenticated, false);
  const expiring = await f.login();
  f.sql(db => db.prepare('UPDATE manager_sessions SET expires_at=0').run());
  assert.equal((await (await f.request('/api/manage/session', { headers: { Cookie: expiring.cookie } })).json()).authenticated, false);
});

test('writes enforce Origin and session before reaching upload or delete', async t => {
  let uploads = 0;
  const f = await fixture(t, { uploadHandler: async (req, res) => { uploads++; res.json({ results: [] }); } });
  const id = await f.publish(sourcePhoto, sampleVariants);
  for (const [method, path] of [['POST', '/api/photos'], ['DELETE', `/api/photos/${id}`], ['DELETE', '/api/manage/session']]) {
    assert.equal((await f.request(path, { method, headers: { Origin: f.config.publicOrigin } })).status, 401);
    assert.equal((await f.request(path, { method })).status, 403);
  }
  const { cookie } = await f.login();
  for (const origin of ['http://evil.test', 'null', `${f.config.publicOrigin}.evil.test`]) {
    assert.equal((await f.request('/api/photos', { method: 'POST', headers: { Origin: origin, Cookie: cookie } })).status, 403);
    assert.equal((await f.request(`/api/photos/${id}`, { method: 'DELETE', headers: { Origin: origin, Cookie: cookie } })).status, 403);
    assert.equal((await f.request('/api/manage/session', { method: 'DELETE', headers: { Origin: origin, Cookie: cookie } })).status, 403);
  }
  assert.equal(uploads, 0); assert.ok(await f.repository.findPublishedPhoto(id));
  assert.equal((await f.request('/api/photos', { method: 'POST', headers: { Origin: f.config.publicOrigin, Cookie: cookie } })).status, 200);
  assert.equal(uploads, 1);
  assert.equal((await f.request(`/api/photos/${id}`, { method: 'DELETE', headers: { Origin: f.config.publicOrigin, Cookie: cookie } })).status, 200);
  assert.equal(f.objects.size, 0);
});

test('delete hides immediately, returns pending, survives restart and recovers metadata', async t => {
  const f = await fixture(t);
  const id = await f.publish(sourcePhoto, sampleVariants);
  const { cookie } = await f.login();
  const remove = f.storage.delete;
  f.storage.delete = async () => { throw new Error('storage unavailable'); };
  const headers = { Origin: f.config.publicOrigin, Cookie: cookie };
  const response = await f.request(`/api/photos/${id}`, { method: 'DELETE', headers });
  assert.equal(response.status, 202); assert.deepEqual(await response.json(), { id, cleanup: 'pending' });
  assert.equal((await f.request(`/api/photos/${id}`)).status, 404);
  assert.equal((await f.request(`/media/${id}/320.webp`)).status, 404);
  assert.equal((await (await f.request('/api/photos')).json()).total, 0);
  assert.equal((await f.repository.listCleanupJobs()).length, 1);
  assert.equal(f.sql(db => db.prepare('SELECT published FROM photos WHERE id=?').get(id)).published, 0);
  await f.restart();
  assert.equal((await f.request(`/api/photos/${id}`, { method: 'DELETE', headers })).status, 202);
  f.storage.delete = remove;
  assert.deepEqual(await f.lifecycle.recover(), []);
  assert.equal((await f.repository.listCleanupJobs()).length, 0);
  assert.equal(f.sql(db => db.prepare('SELECT COUNT(*) AS n FROM photos').get()).n, 0);
  assert.equal(f.objects.size, 0);
  assert.equal((await f.request(`/api/photos/${id}`, { method: 'DELETE', headers })).status, 404);
});

test('mounted media uses the Prisma repository and streams storage headers', async t => {
  const f = await fixture(t);
  const id = await f.publish(sourcePhoto, sampleVariants);
  const response = await f.request(`/media/${id}/320.webp`);
  assert.equal(response.status, 200); assert.equal(await response.text(), 'abc');
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('content-length'), '3');
  assert.equal(response.headers.get('etag'), '"test-etag"');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await f.request(`/media/${id}/960.webp`)).status, 404);
  f.storage.get = async () => { throw new Error('sensitive internal path and credential'); };
  const failed = await f.request(`/media/${id}/320.webp`);
  assert.equal(failed.status, 503); assert.equal(failed.headers.get('cache-control'), 'no-store');
});

test('safe errors, bounded login body, Secure cookie, static routing and reserved upload', async t => {
  const f = await fixture(t, { secureCookie: true });
  const { cookie, header } = await f.login();
  assert.match(header, /; Secure/i);
  const headers = { Origin: f.config.publicOrigin, 'Content-Type': 'application/json' };
  assert.equal((await f.request('/api/manage/session', { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await f.request('/api/manage/session', { method: 'POST', headers, body: JSON.stringify({ capability: 'x'.repeat(3000) }) })).status, 413);
  const upload = await f.request('/api/photos', { method: 'POST', headers: { Origin: f.config.publicOrigin, Cookie: cookie } });
  assert.equal(upload.status, 503); assert.equal((await upload.json()).error.code, 'UPLOAD_NOT_READY');
  const original = f.repository.listPublishedPhotos;
  f.repository.listPublishedPhotos = async () => { throw new Error('secret credential /internal/path'); };
  const failure = await f.request('/api/photos');
  assert.equal(failure.status, 500); assert.doesNotMatch(await failure.text(), /credential|internal|secret/);
  f.repository.listPublishedPhotos = original;
  for (const route of ['/', '/manage', '/photos/example']) { const response = await f.request(route); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/); }
  for (const route of ['/api/nope', '/.env', '/package.json', '/api/prisma/schema.prisma']) assert.equal((await f.request(route)).status, 404);
});

test('repeated invalid capabilities are rate limited', async t => {
  const f = await fixture(t);
  const init = { method: 'POST', headers: { Origin: f.config.publicOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ capability: 'wrong' }) };
  for (let i = 0; i < 10; i++) assert.equal((await f.request('/api/manage/session', init)).status, 401);
  assert.equal((await f.request('/api/manage/session', init)).status, 429);
});
