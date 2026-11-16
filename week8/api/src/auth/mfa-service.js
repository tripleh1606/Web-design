const { hashToken, generateRawToken, verifyPassword } = require('./credentials');
const { createSecretVault, generateSecret, matchStep, generateRecoveryCodes, normalizeRecoveryCode } = require('./mfa-crypto');
const { asyncRoute, fail } = require('./response');

const CHALLENGE_MS = 5 * 60_000;
const SETUP_MS = 10 * 60_000;
const LOCK_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const publicUser = (user) => ({ id: user.id, email: user.email });
const recoveryHash = (userId, code) => hashToken('soucha-mfa-recovery:' + userId + ':' + normalizeRecoveryCode(code));

function createMfaService({ prisma, throttle, accessTokens, encryptionKey }) {
  const vault = createSecretVault(encryptionKey);
  const unavailable = () => ({ status: 503, code: 'MFA_UNAVAILABLE', message: 'Xác thực hai bước chưa sẵn sàng. Vui lòng liên hệ quản trị viên.' });
  const invalid = () => ({ status: 400, code: 'INVALID_MFA', message: 'Mã xác thực không đúng, đã dùng hoặc đã hết hạn.' });
  const expired = () => ({ status: 401, code: 'MFA_CHALLENGE_EXPIRED', message: 'Yêu cầu xác thực đã hết hạn. Vui lòng đăng nhập lại.' });
  const locked = (state, now) => state?.lockedUntil > now ? ({ status: 429, code: 'MFA_LOCKED', message: 'Quá nhiều lần thử sai. Vui lòng thử lại sau.', retryAfter: Math.ceil((state.lockedUntil - now) / 1000) }) : null;
  const signedIn = (user, credential, mfaVerified) => ({ user: publicUser(user), accessToken: accessTokens.issue(user.id, { mfaVerified, authVersion: credential?.authVersion || 0 }), tokenType: 'Bearer' });
  async function ensure(tx, userId) {
    return tx.mfaCredential.upsert({ where: { userId }, create: { userId }, update: {} });
  }
  async function failure(tx, credential, now) {
    const failedCount = (credential.lockedUntil && credential.lockedUntil <= now ? 0 : credential.failedCount) + 1;
    const state = await tx.mfaCredential.update({ where: { userId: credential.userId }, data: {
      failedCount, lockedUntil: failedCount >= MAX_FAILURES ? new Date(+now + LOCK_MS) : null
    } });
    return locked(state, now) || invalid();
  }
  async function acceptCode(tx, credential, code, now, { pending = false } = {}) {
    const cipher = pending ? credential.pendingCipher : credential.secretCipher;
    if (/^\d{6}$/.test(code || '') && cipher) {
      if (!vault) return { error: unavailable() };
      const step = matchStep(vault.decrypt(cipher, credential.userId), code, now, pending ? -1 : credential.lastStep);
      if (step !== null) {
        await tx.mfaCredential.update({ where: { userId: credential.userId }, data: { lastStep: step, failedCount: 0, lockedUntil: null } });
        return { ok: true };
      }
    } else if (!pending && typeof code === 'string' && /^[A-F0-9]{20}$/.test(normalizeRecoveryCode(code))) {
      const used = await tx.mfaRecoveryCode.updateMany({ where: { userId: credential.userId, codeHash: recoveryHash(credential.userId, code), usedAt: null }, data: { usedAt: now } });
      if (used.count === 1) {
        await tx.mfaCredential.update({ where: { userId: credential.userId }, data: { failedCount: 0, lockedUntil: null } });
        return { ok: true };
      }
    }
    return { error: await failure(tx, credential, now) };
  }
  async function newRecoveryCodes(tx, userId) {
    const recoveryCodes = generateRecoveryCodes();
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({ data: recoveryCodes.map(code => ({ userId, codeHash: recoveryHash(userId, code) })) });
    return recoveryCodes;
  }
  // Called inside login's credential-verification transaction and shared user lock.
  async function afterPassword(tx, user) {
    const credential = await tx.mfaCredential.findUnique({ where: { userId: user.id } });
    if (!credential?.enabled) return { data: signedIn(user, credential, false) };
    const now = new Date(), lock = locked(credential, now);
    if (lock) return { error: lock };
    if (!vault) return { error: unavailable() };
    const challenge = generateRawToken();
    await tx.mfaChallenge.deleteMany({ where: { userId: user.id } });
    await tx.mfaChallenge.create({ data: { userId: user.id, tokenHash: hashToken(challenge), authVersion: credential.authVersion, expiresAt: new Date(+now + CHALLENGE_MS) } });
    return { data: { next: 'mfa', challenge, expiresIn: CHALLENGE_MS / 1000 } };
  }
  async function verifyChallenge(challenge, code) {
    if (typeof challenge !== 'string' || !/^[a-f0-9]{64}$/.test(challenge)) return { error: expired() };
    const tokenHash = hashToken(challenge);
    const snapshot = await prisma.mfaChallenge.findUnique({ where: { tokenHash } });
    if (!snapshot) return { error: expired() };
    return prisma.$transaction(async tx => {
      await throttle.lockUser(tx, snapshot.userId);
      const record = await tx.mfaChallenge.findUnique({ where: { tokenHash } });
      const user = await tx.user.findUnique({ where: { id: snapshot.userId } });
      const credential = await tx.mfaCredential.findUnique({ where: { userId: snapshot.userId } });
      const now = new Date();
      if (!record || record.usedAt || record.expiresAt <= now || user?.status !== 'active' || !user.emailVerifiedAt || !credential?.enabled || credential.authVersion !== record.authVersion) return { error: expired() };
      const lock = locked(credential, now);
      if (lock) return { error: lock };
      const accepted = await acceptCode(tx, credential, code, now);
      if (accepted.error) return accepted;
      const claim = await tx.mfaChallenge.updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claim.count !== 1) throw new Error('MFA challenge lost its lock');
      return { data: signedIn(user, credential, true) };
    }, { timeout: 15000 });
  }
  function authorized(credential, claims) {
    return (credential?.authVersion || 0) === (claims?.av || 0) && (!credential?.enabled || claims?.mfa === true);
  }
  const requireCurrent = asyncRoute(async (req, res, next) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { status: true, emailVerifiedAt: true, mfaCredential: true } });
    if (!user || user.status !== 'active' || !user.emailVerifiedAt || !authorized(user.mfaCredential, req.accessClaims)) return fail(res, 401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập lại để tiếp tục.');
    next();
  });
  async function manage(userId, claims, action, { password, code } = {}) {
    return prisma.$transaction(async tx => {
      await throttle.lockUser(tx, userId);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== 'active' || !user.emailVerifiedAt) return { error: expired() };
      const credential = await ensure(tx, userId), now = new Date();
      if (!authorized(credential, claims)) return { error: { status: 401, code: 'AUTH_REQUIRED', message: 'Vui lòng đăng nhập lại để tiếp tục.' } };
      if (action === 'status') return { data: { enabled: credential.enabled, configured: Boolean(vault),
        setupPending: !credential.enabled && Boolean(credential.pendingCipher) && credential.pendingExpiresAt > now,
        setupExpiresIn: credential.pendingExpiresAt > now ? Math.ceil((credential.pendingExpiresAt - now) / 1000) : 0,
        recoveryRemaining: await tx.mfaRecoveryCode.count({ where: { userId, usedAt: null } }) } };
      const lock = locked(credential, now);
      if (lock) return { error: lock };
      if (!vault) return { error: unavailable() };
      if (action !== 'enable') {
        if (typeof password !== 'string' || password.length > 128 || !await verifyPassword(password, user.passwordHash)) return { error: await failure(tx, credential, now) };
      }
      if (action === 'setup') {
        if (credential.enabled) return { error: { status: 409, code: 'MFA_ALREADY_ENABLED', message: 'Xác thực hai bước đã bật. Hãy tắt thiết bị cũ trước khi thiết lập lại.' } };
        const secret = generateSecret();
        await tx.mfaCredential.update({ where: { userId }, data: { pendingCipher: vault.encrypt(secret, userId), pendingExpiresAt: new Date(+now + SETUP_MS) } });
        const label = encodeURIComponent('Soucha:' + user.email);
        const otpauthUri = 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=Soucha&algorithm=SHA1&digits=6&period=30';
        return { data: { secret, otpauthUri, expiresIn: SETUP_MS / 1000 } };
      }
      if (action === 'enable') {
        if (credential.enabled || !credential.pendingCipher || credential.pendingExpiresAt <= now) return { error: invalid() };
        const accepted = await acceptCode(tx, credential, code, now, { pending: true });
        if (accepted.error) return accepted;
        const updated = await tx.mfaCredential.update({ where: { userId }, data: { enabled: true, secretCipher: credential.pendingCipher, pendingCipher: null, pendingExpiresAt: null, authVersion: { increment: 1 } } });
        await tx.mfaChallenge.deleteMany({ where: { userId } });
        await tx.session.deleteMany({ where: { userId } });
        return { data: { enabled: true, recoveryCodes: await newRecoveryCodes(tx, userId), ...signedIn(user, updated, true) } };
      }
      if (!credential.enabled) return { error: invalid() };
      const accepted = await acceptCode(tx, credential, code, now);
      if (accepted.error) return accepted;
      if (action === 'recovery') return { data: { recoveryCodes: await newRecoveryCodes(tx, userId) } };
      const updated = await tx.mfaCredential.update({ where: { userId }, data: { enabled: false, secretCipher: null, pendingCipher: null, pendingExpiresAt: null, lastStep: null, authVersion: { increment: 1 } } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaChallenge.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      return { data: { enabled: false, ...signedIn(user, updated, false) } };
    }, { timeout: 15000 });
  }
  return { afterPassword, verifyChallenge, requireCurrent, manage };
}
module.exports = { createMfaService, CHALLENGE_MS, SETUP_MS, LOCK_MS, MAX_FAILURES };
