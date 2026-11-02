const assert = require('node:assert/strict');

// Shared by the real-process smoke and an isolated HTTP regression. A live
// session must survive restart BEFORE we revoke it and test the captured sid.
async function verifySessionLifecycle({ request, restart, findSession, sid, csrfToken, captchaProof }) {
  const headers = { cookie: `sid=${sid}` };
  const authenticated = () => request('/admin/dishes', { headers, redirect: 'manual' });
  assert.equal((await authenticated()).status, 200);
  const csrfFailure = await request('/admin/dishes', { method: 'POST', headers, redirect: 'manual' });
  assert.equal(csrfFailure.status, 403, 'Authenticated mutation without CSRF must be rejected');
  assert.ok(await findSession(), 'CSRF rejection must preserve the session');

  await restart();
  assert.equal((await authenticated()).status, 200, 'An unexpired session must survive restart');
  assert.ok(await findSession(), 'Session must still exist before logout');

  const logout = await request('/logout', {
    method: 'POST', redirect: 'manual', headers,
    body: new URLSearchParams({ _csrf: csrfToken, 'g-recaptcha-response': captchaProof })
  });
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get('location'), '/login');
  assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0/);
  assert.equal(await findSession(), null, 'Logout must remove the server-side session');
  for (const [route, method] of [['/dishes', 'GET'], ['/admin/dishes', 'GET'], ['/admin/dishes', 'POST']]) {
    const replay = await request(route, { method, headers, redirect: 'manual' });
    assert.equal(replay.status, 303, 'Revoked sid must fail the login guard before CSRF/CRUD');
    assert.equal(replay.headers.get('location'), '/login');
  }
}

module.exports = { verifySessionLifecycle };
