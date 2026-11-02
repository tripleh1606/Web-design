const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

async function disposableSqlite(t, { schema } = {}) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = path.resolve(await mkdtemp(path.join(temporaryRoot, 'soucha-register-')));
  const root = path.resolve(__dirname, '../..');
  const databaseUrl = `file:${path.join(directory, 'test.db').replaceAll('\\', '/')}`;
  const clients = [];
  t.after(async () => {
    await Promise.all(clients.map(client => client.$disconnect()));
    if (path.dirname(directory) !== temporaryRoot || !path.basename(directory).startsWith('soucha-register-')) {
      throw new Error('Refusing to remove a directory outside this test fixture');
    }
    await rm(directory, { recursive: true, force: true });
  });
  async function pushSchema(schema = path.join(root, 'prisma/schema.prisma')) {
    await execFileAsync(process.execPath, [path.join(root, 'scripts/prisma.js'), 'db', 'push', '--skip-generate', '--schema', schema], {
      cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, windowsHide: true, timeout: 60000
    });
  }
  const { PrismaClient } = require('../../generated/prisma');
  function createClient() {
    const client = new PrismaClient({ datasourceUrl: databaseUrl });
    clients.push(client);
    return client;
  }
  async function executeSql(file) {
    await execFileAsync(process.execPath, [path.join(root, 'scripts/prisma.js'), 'db', 'execute', '--file', file, '--schema', path.join(root, 'prisma/schema.prisma')], {
      cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, windowsHide: true, timeout: 60000
    });
  }
  await pushSchema(schema);
  return { prisma: createClient(), createClient, pushSchema, executeSql, databaseUrl };
}

module.exports = { disposableSqlite };
