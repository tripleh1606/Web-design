// Run before Prisma db push, with application writers stopped. Unknown roles must
// be mapped explicitly by an operator before any existing roles are changed.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { createPrisma, databaseProvider } = require('../src/database');
const { ROLES } = require('../src/auth/policy');
async function migrateIdentity(prisma, provider) {
  const tables = provider === 'postgresql'
    ? await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'users'`
    : await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`;
  if (!tables.length) return;
  await prisma.$transaction(async tx => {
    if (provider === 'postgresql') await tx.$executeRaw`LOCK TABLE users IN EXCLUSIVE MODE`;
    else await tx.$executeRaw`UPDATE users SET role = role WHERE 1 = 0`;
    const roles = await tx.$queryRaw`SELECT DISTINCT role FROM users`;
    const unknown = roles.map(row => row.role).filter(role => role !== 'viewer' && !ROLES.includes(role));
    if (unknown.length) throw new Error(`Unknown roles require an explicit operator mapping: ${unknown.map(String).join(', ')}`);
    await tx.$executeRaw`UPDATE users SET role = 'customer' WHERE role = 'viewer'`;
  });
}
if (require.main === module) {
  const prisma = createPrisma();
  migrateIdentity(prisma, databaseProvider(process.env.DATABASE_URL))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
module.exports = { migrateIdentity };
