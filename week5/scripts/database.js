const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const api = path.join(root, 'api');
require('dotenv').config({ path: path.join(api, '.env') });
const { schemaPath, databaseProvider } = require('../api/src/database');
const { runSearchSetup } = require('./setup-search');
const action = process.argv[2];
const cli = require.resolve('prisma/build/index.js');
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: api, stdio: 'inherit', env: { ...process.env, RUST_LOG: process.env.RUST_LOG || 'info' }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (action === 'generate') {
  for (const name of ['schema.prisma', 'schema.sqlite.prisma']) run(['generate', '--schema', path.join(api, 'prisma', name)]);
} else if (action === 'push') {
  const url = process.env.DATABASE_URL;
  if (/PROJECT_REF|YOUR_PASSWORD/.test(url || '')) throw new Error('Điền DATABASE_URL thật trong api/.env trước khi kết nối Supabase.');
  const postgresql = databaseProvider(url) === 'postgresql';
  if (postgresql) runSearchSetup();
  run(['db', 'push', '--skip-generate', '--schema', schemaPath(url)]);
  if (postgresql) runSearchSetup();
} else if (action === 'search') {
  runSearchSetup();
} else if (action === 'seed') {
  const result = spawnSync(process.execPath, [path.join(api, 'prisma/seed.js')], { cwd: api, stdio: 'inherit', env: process.env });
  process.exitCode = result.status === 0 ? 0 : result.status || 1;
} else throw new Error('Database action phải là generate, push, search hoặc seed.');
