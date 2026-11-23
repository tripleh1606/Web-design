import { loadEnvironment, readConfig } from './config.js';
import { createRuntime } from './runtime.js';

loadEnvironment();
let runtime;
try {
  runtime = await createRuntime(readConfig(), { worker: false });
  console.log(`Recovery completed; ${runtime.recoveryFailures} job(s) pending.`);
  if (runtime.recoveryFailures) process.exitCode = 1;
} catch {
  console.error('Recovery failed. Check configuration, migration and storage availability; retain the database and jobs.');
  process.exitCode = 1;
} finally { await runtime?.close(); }
