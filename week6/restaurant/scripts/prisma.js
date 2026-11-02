const { spawnSync } = require('node:child_process');

// Match the week5 setup: Prisma 6.12's Windows schema engine needs an explicit
// info log level when creating a new SQLite file; warn can report only
// "Schema engine error". Prisma still loads DATABASE_URL from the local .env.
const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...process.argv.slice(2)], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, RUST_LOG: 'info' }
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
