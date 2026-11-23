import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
async function check(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await check(path);
    else if (/\.(m?js)$/.test(item.name)) execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  }
}
for (const dir of ['api/src', 'web/src', 'scripts', 'tests']) await check(join(root, dir));
execFileSync(process.execPath, ['--check', join(root, 'web/dev-server.mjs')], { stdio: 'inherit' });
console.log('JavaScript syntax checks passed.');
