/**
 * Shared Bruno helpers for week5 API contract.
 * Business: HTTP 200 + { ok: true|false }.
 * Technical: HTTP 4xx/5xx JSON { message } without ok.
 */

function bodyOf(res) {
  return res.getBody();
}

function expectOk(res, expect) {
  expect(res.getStatus()).to.equal(200);
  const body = bodyOf(res);
  expect(body.ok).to.equal(true);
  expect(body).to.have.property('data');
  return body;
}

function expectBizError(res, expect, code, fieldKeys) {
  expect(res.getStatus()).to.equal(200);
  const body = bodyOf(res);
  expect(body.ok).to.equal(false);
  expect(body.error).to.be.an('object');
  expect(body.error.code).to.equal(code);
  if (fieldKeys && fieldKeys.length) {
    expect(body.error.fields).to.be.an('object');
    for (const key of fieldKeys) {
      expect(body.error.fields).to.have.property(key);
    }
  }
  return body;
}

function expectNotFound(res, expect) {
  return expectBizError(res, expect, 'NOT_FOUND');
}

function expectValidation(res, expect, fieldKeys) {
  return expectBizError(res, expect, 'VALIDATION_FAILED', fieldKeys);
}

function expectTechnical(res, expect, status) {
  expect(res.getStatus()).to.equal(status);
  const body = bodyOf(res);
  if (body && typeof body === 'object') {
    expect(Object.prototype.hasOwnProperty.call(body, 'ok')).to.equal(false);
    expect(body).to.have.property('message');
  } else {
    expect(String(body).includes('"ok"')).to.equal(false);
  }
  return body;
}

module.exports = {
  expectOk,
  expectBizError,
  expectNotFound,
  expectValidation,
  expectTechnical,
  expectPlain: expectTechnical,
  bodyOf
};
