import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { createApp } from './app.js';
import { loadEnvironment, readConfig } from './config.js';
import { createRuntime } from './runtime.js';

loadEnvironment();
let runtime;
try {
  const config = readConfig();
  runtime = await createRuntime(config);
  // Person 2 supplies this module. Missing pipeline stays an explicit HTTP 503.
  const uploadModule = new URL('./routes/upload.js', import.meta.url);
  const uploadHandler = existsSync(uploadModule) ? (await import(uploadModule)).createUploadHandler(runtime) : undefined;
  if (existsSync(uploadModule) && typeof uploadHandler !== 'function') throw new Error('Invalid upload integration');
  const app = createApp({ ...runtime, uploadHandler });
  const server = app.listen(config.port, config.host);
  server.requestTimeout = 120_000;
  await once(server, 'listening');
  console.log(`Gallery ready at ${config.publicOrigin}`);
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    server.close(async () => { await runtime.close(); });
    server.closeIdleConnections();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch {
  await runtime?.close();
  console.error('Gallery startup failed. Check .env, database migration and storage configuration.');
  process.exitCode = 1;
}
