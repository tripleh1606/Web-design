const express = require('express');
const QRCode = require('qrcode');
const { jsonForm } = require('./form');
const { asyncRoute, ok, fail } = require('./response');
const { hashToken } = require('./credentials');

function createMfaRouter({ prisma, throttle, accessTokens, mfa }) {
  const router = express.Router();
  const respond = (res, result) => {
    if (!result.error) return ok(res, result.data);
    const { status, code, message, retryAfter } = result.error;
    if (retryAfter) res.set('Retry-After', String(retryAfter));
    return fail(res, status, code, message);
  };
  const budget = asyncRoute(async (req, res, next) => {
    const quota = await prisma.$transaction(tx => throttle.consume(tx, { key: 'mfa:ip:' + hashToken(req.ip || 'unknown'), limit: 60, windowMs: 15 * 60_000 }));
    if (!quota.allowed) {
      res.set('Retry-After', String(quota.retryAfter));
      return fail(res, 429, 'RATE_LIMITED', 'Quá nhiều yêu cầu. Vui lòng thử lại sau.');
    }
    next();
  });
  router.post('/mfa', jsonForm('challenge', 'code'), budget, asyncRoute(async (req, res) => {
    if (typeof req.body.code !== 'string' || req.body.code.length > 64) return fail(res, 400, 'INVALID_MFA', 'Mã xác thực không hợp lệ.');
    respond(res, await mfa.verifyChallenge(req.body.challenge, req.body.code));
  }));
  router.use('/mfa', accessTokens.requireAccessToken, mfa.requireCurrent);
  router.get('/mfa/status', asyncRoute(async (req, res) => respond(res, await mfa.manage(req.auth.userId, req.accessClaims, 'status'))));
  for (const [action, fields] of Object.entries({ setup: ['password'], enable: ['code'], recovery: ['password', 'code'], disable: ['password', 'code'] })) {
    router.post('/mfa/' + action, jsonForm(...fields), budget, asyncRoute(async (req, res) => {
      const result = await mfa.manage(req.auth.userId, req.accessClaims, action, req.body);
      if (result.data?.otpauthUri) result.data.qrCodeDataUrl = await QRCode.toDataURL(result.data.otpauthUri, { errorCorrectionLevel: 'M', width: 240, margin: 2 });
      respond(res, result);
    }));
  }
  return router;
}
module.exports = { createMfaRouter };
