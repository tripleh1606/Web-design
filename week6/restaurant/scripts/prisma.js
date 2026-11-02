const { spawnSync } = require('node:child_process');

// Optional Prisma CLI wrapper retained from the SQLite branch. The active
// production schema is PostgreSQL; commands still load the local .env normally.
const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...process.argv.slice(2)], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, RUST_LOG: 'info' }
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
