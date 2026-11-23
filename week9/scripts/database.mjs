import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { databasePath, loadEnvironment, prismaRoot, weekRoot } from '../api/src/config.js';

loadEnvironment();
const action = process.argv[2];
if (!['generate', 'deploy', 'dev'].includes(action)) throw new Error('Expected generate, deploy or dev');
const filename = databasePath(process.env.DATABASE_URL || 'file:../../data/gallery.sqlite');
if (action !== 'generate') {
  mkdirSync(dirname(filename), { recursive: true });
  // Prisma 6's Windows migration engine can fail on a missing SQLite file.
  // Create only an empty database; Prisma still owns every schema migration.
  if (!existsSync(filename)) { const empty = new DatabaseSync(filename); empty.close(); }
}
const require = createRequire(resolve(weekRoot, 'api/package.json'));
const args = action === 'generate' ? ['generate'] : ['migrate', action];
execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args, '--schema', resolve(prismaRoot, 'schema.prisma'), ...process.argv.slice(3)], {
  cwd: weekRoot, stdio: 'inherit', env: { ...process.env, DATABASE_URL: `file:${filename.replaceAll('\\', '/')}` },
});
