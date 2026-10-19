/**
 * Shared Bruno test helpers for the restaurant API contract.
 * Business errors stay HTTP 200 with { ok: false }.
 * Technical failures are plain-text status codes without an ok envelope.
 */

function bodyOf(res) {
  return res.getBody();
}

function asText(res) {
  const body = bodyOf(res);
  return typeof body === 'string' ? body : JSON.stringify(body);
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

function expectPlain(res, expect, status) {
  expect(res.getStatus()).to.equal(status);
  const text = asText(res);
  expect(text.includes('"ok"')).to.equal(false);
  return text;
}

module.exports = {
  expectOk,
  expectBizError,
  expectNotFound,
  expectValidation,
  expectPlain,
  asText,
  bodyOf
};
