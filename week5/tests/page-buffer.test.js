const { test } = require('node:test');
const assert = require('node:assert/strict');

test('one-page buffer reuses pending/ready requests and retries failed speculative fetches', async () => {
  const { createPageBuffer } = await import('../web/src/page-buffer.js');
  const calls = [];
  let resolve;
  const buffer = createPageBuffer((page) => { calls.push(page); return new Promise((done) => { resolve = done; }); });
  buffer.warm(2);
  buffer.warm(2);
  await Promise.resolve();
  const next = buffer.take(2);
  assert.deepEqual(calls, [2]);
  resolve({ page: 2 });
  assert.deepEqual(await next, { page: 2 });
  let attempts = 0;
  const retry = createPageBuffer(async () => { if (++attempts === 1) throw new Error('network'); return 'recovered'; });
  retry.warm(3);
  await new Promise((done) => setImmediate(done));
  assert.equal(await retry.take(3), 'recovered');
  assert.equal(attempts, 2);
  buffer.warm(4);
  buffer.clear();
  await Promise.resolve();
  const fresh = buffer.take(4);
  assert.deepEqual(calls, [2, 4, 4]);
  resolve('fresh');
  assert.equal(await fresh, 'fresh');
});
