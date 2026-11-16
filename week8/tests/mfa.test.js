const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { fixture } = require('./helpers');
const { base32, totp, matchStep, createSecretVault } = require('../api/src/auth/mfa-crypto');
const { hashPassword, hashToken } = require('../api/src/auth/credentials');
const { createAccessTokens } = require('../api/src/auth/access-token');

test('TOTP matches independent RFC 6238 SHA1 vectors and enforces drift/replay', () => {
  const secret = base32(Buffer.from('12345678901234567890'));
  for (const [seconds, expected] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037']]) {
    assert.equal(totp(secret, Math.floor(seconds / 30), 8), expected);
  }
  const now = 1_700_000_000_000, step = Math.floor(now / 30_000);
  for (const offset of [-1, 0, 1]) assert.equal(matchStep(secret, totp(secret, step + offset), now), step + offset);
  assert.equal(matchStep(secret, totp(secret, step - 2), now), null);
  assert.equal(matchStep(secret, totp(secret, step), now, step), null);
  assert.equal(matchStep(secret, '１２３４５６', now), null);
  const vault = createSecretVault(randomBytes(32).toString('base64url'));
  const encrypted = vault.encrypt(secret, 7);
  assert.ok(!encrypted.includes(secret));
  assert.equal(vault.decrypt(encrypted, 7), secret);
  assert.throws(() => vault.decrypt(encrypted, 8));
  assert.throws(() => createSecretVault('short'));
});

async function setup(t, options = {}) {
  let delivered;
  const app = await fixture({ auth: { ...options, mailer: {
    isConfigured: () => true,
    sendPasswordResetEmail(message) { delivered = message.resetUrl; },
    sendPasswordChangedNotice() {}
  } } });
  t.after(() => app.close());
  const email = 'mfa@example.com', password = 'mfa-test-password';
  const user = await app.prisma.user.create({ data: { email, emailOriginal: email, passwordHash: await hashPassword(password), status: 'active', emailVerifiedAt: new Date() } });
  let token;
  async function auth(action, data, bearer = token) {
    return app.call('/api/auth/' + action, { method: data === undefined ? 'GET' : 'POST', data, headers: bearer ? { Authorization: 'Bearer ' + bearer } : {} });
  }
  const login = async () => auth('login', { email, password }, '');
  const first = await login();
  assert.equal(first.status, 200);
  token = first.body.data.accessToken;
  const page = (bearer) => app.call('/api/dishes', { headers: { Authorization: 'Bearer ' + bearer } });
  async function enable() {
    const pending = await auth('mfa/setup', { password });
    assert.equal(pending.status, 200);
    assert.match(pending.body.data.qrCodeDataUrl, /^data:image\/png;base64,/);
    const secret = pending.body.data.secret;
    assert.equal((await app.prisma.mfaCredential.findUnique({ where: { userId: user.id } })).enabled, false);
    const step = Math.floor(Date.now() / 30_000);
    const enabled = await auth('mfa/enable', { code: totp(secret, step) });
    assert.equal(enabled.status, 200);
    token = enabled.body.data.accessToken;
    return { secret, step, recoveryCodes: enabled.body.data.recoveryCodes };
  }
  return { ...app, email, password, user, auth, login, enable, page, token: () => token, resetUrl: () => delivered };
}

test('MFA setup, pending login, single-use proofs, recovery regeneration, disable and JWT revocation', async t => {
  const app = await setup(t);
  const originalToken = app.token();
  assert.equal((await app.auth('mfa/status', undefined, '')).status, 401);
  const firstSetup = await app.auth('mfa/setup', { password: app.password });
  const staleSecret = firstSetup.body.data.secret;
  const resumeStatus = (await app.auth('mfa/status', undefined, (await app.login()).body.data.accessToken)).body.data;
  assert.equal(resumeStatus.setupPending, true, 'fresh login can resume the scanned pending setup');
  assert.ok(resumeStatus.setupExpiresIn > 0);
  assert.equal(resumeStatus.secret, undefined);
  const rejectedSetup = await app.auth('mfa/enable', { code: 'INVALID-CODE' });
  assert.equal(rejectedSetup.status, 400);
  assert.equal((await app.prisma.mfaCredential.findUnique({ where: { userId: app.user.id } })).enabled, false);
  const { secret, step, recoveryCodes } = await app.enable();
  assert.notEqual(secret, staleSecret);
  assert.equal(recoveryCodes.length, 8);
  assert.equal((await app.page(originalToken)).status, 401);
  const cred = await app.prisma.mfaCredential.findUnique({ where: { userId: app.user.id } });
  assert.equal(cred.lastStep, step);
  assert.notEqual(cred.secretCipher, secret);
  assert.equal(cred.pendingCipher, null);
  const codes = await app.prisma.mfaRecoveryCode.findMany();
  assert.ok(codes.every(row => !recoveryCodes.includes(row.codeHash) && /^[a-f0-9]{64}$/.test(row.codeHash)));
  assert.equal((await app.auth('mfa/status')).body.data.recoveryRemaining, 8);
  assert.ok(!JSON.stringify((await app.auth('mfa/status')).body).includes(secret));

  let pending = (await app.login()).body.data;
  assert.equal(pending.next, 'mfa');
  assert.equal(pending.accessToken, undefined);
  assert.equal(pending.user, undefined);
  assert.equal((await app.page(pending.challenge)).status, 401);
  const record = await app.prisma.mfaChallenge.findFirst();
  assert.notEqual(record.tokenHash, pending.challenge);
  assert.equal((await app.auth('mfa', { challenge: pending.challenge, code: totp(secret, step) }, '')).status, 400, 'setup code cannot replay');
  const future = step + 1;
  const passed = await app.auth('mfa', { challenge: pending.challenge, code: totp(secret, future) }, '');
  assert.equal(passed.status, 200);
  assert.equal((await app.page(passed.body.data.accessToken)).status, 200);
  assert.equal((await app.auth('mfa', { challenge: pending.challenge, code: recoveryCodes[0] }, '')).status, 401);
  pending = (await app.login()).body.data;
  assert.equal((await app.auth('mfa', { challenge: pending.challenge, code: totp(secret, future) }, '')).status, 400);
  const races = await Promise.all([0, 1].map(() => app.auth('mfa', { challenge: pending.challenge, code: recoveryCodes[0] }, '')));
  assert.deepEqual(races.map(r => r.status).sort(), [200, 401]);
  pending = (await app.login()).body.data;
  assert.equal((await app.auth('mfa', { challenge: pending.challenge, code: recoveryCodes[0] }, '')).status, 400);
  const regen = await app.auth('mfa/recovery', { password: app.password, code: recoveryCodes[1] });
  assert.equal(regen.status, 200);
  assert.equal((await app.auth('mfa', { challenge: pending.challenge, code: recoveryCodes[2] }, '')).status, 400, 'old recovery set invalidated');
  const renewed = regen.body.data.recoveryCodes;
  assert.equal((await app.auth('mfa/disable', { password: 'incorrect', code: renewed[0] })).status, 400);
  const disabled = await app.auth('mfa/disable', { password: app.password, code: renewed[0] });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.data.enabled, false);
  assert.equal((await app.page(app.token())).status, 401);
  assert.equal((await app.page(disabled.body.data.accessToken)).status, 200);
  assert.equal(await app.prisma.mfaRecoveryCode.count(), 0);
  assert.equal((await app.prisma.mfaCredential.findUnique({ where: { userId: app.user.id } })).secretCipher, null);
  assert.ok((await app.login()).body.data.accessToken);
});

test('five failures persist across login challenges and API instances; correct proofs do not bypass lock', async t => {
  const app = await setup(t);
  const { recoveryCodes } = await app.enable();
  for (let i = 0; i < 5; i++) {
    const pending = (await app.login()).body.data;
    const response = await app.auth('mfa', { challenge: pending.challenge, code: 'INVALID-CODE' }, '');
    assert.equal(response.status, i === 4 ? 429 : 400);
  }
  const blocked = await app.login();
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
  // Restarting the verifier reads the same persisted lock state.
  const { createMfaService } = require('../api/src/auth/mfa-service');
  const { createThrottle } = require('../api/src/auth/throttle');
  const service = createMfaService({ prisma: app.prisma, throttle: createThrottle('sqlite'), encryptionKey: randomBytes(32).toString('base64url'), accessTokens: {} });
  const record = await app.prisma.mfaChallenge.findFirst();
  assert.ok(record);
  const credential = await app.prisma.mfaCredential.findUnique({ where: { userId: app.user.id } });
  assert.equal(credential.failedCount, 5);
  // No encryption is used before the persistent lock is checked.
  const restored = await app.prisma.$transaction(tx => service.afterPassword(tx, app.user));
  assert.equal(restored.error.code, 'MFA_LOCKED');
  await app.prisma.mfaCredential.update({ where: { userId: app.user.id }, data: { lockedUntil: new Date(Date.now() - 1) } });
  const pending = (await app.login()).body.data;
  assert.equal((await app.auth('mfa', { challenge: pending.challenge, code: recoveryCodes[0] }, '')).status, 200);
});

test('password reset preserves MFA but invalidates JWTs/challenges; expiry does not consume recovery codes', async t => {
  const app = await setup(t);
  const { recoveryCodes } = await app.enable();
  const before = await app.prisma.mfaCredential.findUnique({ where: { userId: app.user.id } });
  let pending = (await app.login()).body.data;
  await app.prisma.mfaChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal((await app.auth('mfa', { challenge: pending.challenge, code: recoveryCodes[0] }, '')).status, 401);
  assert.equal(await app.prisma.mfaRecoveryCode.count({ where: { usedAt: null } }), 8);
  pending = (await app.login()).body.data;
  assert.equal((await app.auth('forgot', { email: app.email })).status, 200);
  for (let i = 0; i < 100 && !app.resetUrl(); i++) await new Promise(r => setTimeout(r, 20));
  const token = new URL(app.resetUrl()).searchParams.get('token');
  const reset = await app.auth('reset', { token, password: app.password + '-updated', confirmPassword: app.password + '-updated' });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.data.accessToken, undefined);
  const after = await app.prisma.mfaCredential.findUnique({ where: { userId: app.user.id } });
  assert.equal(after.enabled, true);
  assert.equal(after.secretCipher, before.secretCipher);
  assert.equal(after.authVersion, before.authVersion + 1);
  assert.equal((await app.page(app.token())).status, 401);
  assert.equal((await app.auth('mfa', { challenge: pending.challenge, code: recoveryCodes[0] }, '')).status, 401);
  const login = await app.auth('login', { email: app.email, password: app.password + '-updated' }, '');
  assert.equal(login.body.data.next, 'mfa');
  assert.equal(login.body.data.accessToken, undefined);
});

test('missing encryption configuration fails closed for setup without blocking non-MFA login', async t => {
  const app = await setup(t, { mfaEncryptionKey: '' });
  assert.equal((await app.auth('mfa/status')).body.data.configured, false);
  assert.equal((await app.auth('mfa/setup', { password: app.password })).status, 503);
  assert.ok((await app.login()).body.data.accessToken);
  await app.prisma.mfaCredential.upsert({ where: { userId: app.user.id }, create: { userId: app.user.id, enabled: true }, update: { enabled: true } });
  assert.equal((await app.login()).status, 503);
});

test('MFA and current database roles protect me, logout, admin and business endpoints together', async t => {
  const secret = randomBytes(32).toString('base64url');
  const app = await setup(t, { jwtSecret: secret });
  assert.equal(await app.prisma.mfaCredential.count(), 0);
  assert.equal((await app.auth('mfa/status')).status, 200);
  assert.equal(await app.prisma.mfaCredential.count(), 0, 'reading status does not initialize credentials');
  await app.prisma.user.update({ where: { id: app.user.id }, data: { role: 'admin' } });
  await app.enable();
  const credential = await app.prisma.mfaCredential.findUnique({ where: { userId: app.user.id } });
  const signer = createAccessTokens(secret);
  const incomplete = signer.issue(app.user.id, { authVersion: credential.authVersion });
  const oldVersion = signer.issue(app.user.id, { authVersion: credential.authVersion - 1, mfaVerified: true });
  for (const token of [incomplete, oldVersion]) {
    for (const [path, method] of [['/api/auth/me', 'GET'], ['/api/auth/logout', 'POST'], ['/api/users', 'GET'], ['/api/dishes', 'GET']]) {
      const response = await app.call(path, { method, headers: { Authorization: 'Bearer ' + token } });
      assert.equal(response.status, 401, path);
    }
  }
  assert.equal((await app.auth('me')).body.data.user.role, 'admin');
  assert.equal((await app.call('/api/users', { headers: { Authorization: 'Bearer ' + app.token() } })).status, 200);
  await app.prisma.user.update({ where: { id: app.user.id }, data: { role: 'staff' } });
  assert.equal((await app.auth('me')).body.data.user.role, 'staff');
  assert.equal((await app.call('/api/users', { headers: { Authorization: 'Bearer ' + app.token() } })).status, 403);
  assert.equal((await app.page(app.token())).status, 200);
});

test('expired setup cannot enable MFA and a fresh login preserves an unexpired scanned setup', async t => {
  const app = await setup(t);
  const pending = (await app.auth('mfa/setup', { password: app.password })).body.data;
  const freshToken = (await app.login()).body.data.accessToken;
  const status = (await app.auth('mfa/status', undefined, freshToken)).body.data;
  assert.equal(status.setupPending, true);
  assert.equal(status.secret, undefined);
  assert.equal((await app.auth('mfa/enable', { code: totp(pending.secret, Math.floor(Date.now() / 30_000)) }, freshToken)).status, 200);
  const credential = await app.prisma.mfaCredential.findUnique({ where: { userId: app.user.id } });
  assert.equal(credential.enabled, true);
  // A separate fresh account proves expiry keeps MFA off and does not emit codes.
  const other = await setup(t);
  const expiredSetup = (await other.auth('mfa/setup', { password: other.password })).body.data;
  await other.prisma.mfaCredential.update({ where: { userId: other.user.id }, data: { pendingExpiresAt: new Date(Date.now() - 1) } });
  assert.equal((await other.auth('mfa/status')).body.data.setupPending, false);
  assert.equal((await other.auth('mfa/status')).body.data.setupExpired, true);
  const expiredResponse = await other.auth('mfa/enable', { code: totp(expiredSetup.secret, Math.floor(Date.now() / 30_000)) });
  assert.equal(expiredResponse.status, 400);
  assert.equal(expiredResponse.body.error.code, 'MFA_SETUP_EXPIRED');
  assert.equal((await other.prisma.mfaCredential.findFirst()).enabled, false);
  assert.equal(await other.prisma.mfaRecoveryCode.count(), 0);
});
