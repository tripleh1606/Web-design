const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sqlFile = path.join(root, 'api/prisma/search-setup.sql');

function runSearchSetup({ schema = path.join(root, 'api/prisma/schema.prisma'), run = spawnSync } = {}) {
  // Execute the complete file; semicolons also occur inside function/DO bodies.
  const result = run(process.execPath, [require.resolve('prisma/build/index.js'),
    'db', 'execute', '--file', sqlFile, '--schema', schema], {
    cwd: path.dirname(schema), env: process.env, encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error('SEARCH_SETUP_FAILED');
  console.log('Search column, trigger and indexes are synchronized.');
}
function main({ schema, envFile = path.join(root, 'api/.env') } = {}) {
  require('dotenv').config({ path: envFile });
  runSearchSetup({ schema });
}
if (require.main === module) {
  try { main(); }
  catch (error) { console.error('Search setup failed:', error.code || error.message); process.exitCode = 1; }
}
module.exports = { runSearchSetup, main, sqlFile };
