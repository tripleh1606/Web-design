import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { startCleanupWorker } from '../../api/src/cleanup/worker.js';
import { fixture, sourcePhoto, sampleVariants } from './helpers.mjs';

test('cleanup worker retries the existing durable delete job after storage recovers', async t => {
  const f = await fixture(t);
  const id = await f.publish(sourcePhoto, sampleVariants);
  const remove = f.storage.delete;
  f.storage.delete = async () => { throw new Error('offline'); };
  assert.equal((await f.lifecycle.deletePhoto(id)).pending, true);
  let failed, completed;
  const failure = new Promise(resolve => { failed = resolve; });
  const completion = new Promise(resolve => { completed = resolve; });
  const finish = f.repository.finishDelete;
  f.repository.finishDelete = async jobId => { await finish(jobId); completed(); };
  const worker = startCleanupWorker({ lifecycle: f.lifecycle, repository: f.repository, intervalSeconds: 0.01, report: failed });
  const timeout = setTimeout(() => { failed('timeout'); completed('timeout'); }, 3000);
  try {
    assert.match(await failure, /Cleanup pending/);
    assert.equal((await f.repository.listCleanupJobs()).length, 1);
    f.storage.delete = remove;
    assert.notEqual(await completion, 'timeout');
    await worker.stop();
    assert.equal(f.objects.size, 0);
    assert.equal((await f.repository.listCleanupJobs()).length, 0);
  } finally { clearTimeout(timeout); await worker.stop(); }
});

test('entrypoint serves same-origin web/API and cleanup CLI uses the migrated DB', async t => {
  const f = await fixture(t);
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const weekRoot = fileURLToPath(new URL('../../', import.meta.url));
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env, DATABASE_URL: `file:${f.filename.replaceAll('\\', '/')}`,
    HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin,
    MANAGE_CAPABILITY: f.config.capability, COOKIE_SECURE: 'false',
    SESSION_TTL_SECONDS: '3600', CLEANUP_INTERVAL_SECONDS: '60',
    S3_ENDPOINT: 'http://127.0.0.1:1', S3_REGION: 'us-east-1', S3_BUCKET: 'test-only',
    S3_ACCESS_KEY_ID: 'test-only', S3_SECRET_ACCESS_KEY: 'test-only', S3_FORCE_PATH_STYLE: 'true',
  };
  execFileSync(process.execPath, [join(weekRoot, 'scripts/database.mjs'), 'deploy'], { cwd: weekRoot, env, stdio: 'pipe' });
  const child = spawn(process.execPath, [join(weekRoot, 'api/src/server.js')], { cwd: weekRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10000);
      child.on('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`)); });
      child.stdout.on('data', () => { if (output.includes('Gallery ready')) { clearTimeout(timeout); resolve(); } });
      child.on('error', error => { clearTimeout(timeout); reject(error); });
    });
    assert.equal((await fetch(origin)).status, 200);
    assert.deepEqual(await (await fetch(`${origin}/api/photos`)).json(), { items: [], total: 0, page: 1, limit: 12 });
    const login = await fetch(`${origin}/api/manage/session`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ capability: f.config.capability }) });
    assert.equal(login.status, 204);
    const recovery = execFileSync(process.execPath, [join(weekRoot, 'api/src/cleanup.js')], { cwd: weekRoot, env, encoding: 'utf8' });
    assert.match(recovery, /0 job\(s\) pending/);
  } finally {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
  }
});
