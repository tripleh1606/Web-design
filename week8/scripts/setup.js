const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const folder of ['api', 'web']) {
  const target = path.join(root, folder, '.env');
  if (!fs.existsSync(target)) fs.copyFileSync(`${target}.example`, target);
}
for (const action of ['generate', 'push', 'seed']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'database.js'), action], {
    cwd: path.join(root, 'api'), stdio: 'inherit',
    // Prisma 6's Windows schema engine needs an explicit log level on initial SQLite creation.
    env: { ...process.env, RUST_LOG: process.env.RUST_LOG || 'info' }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
