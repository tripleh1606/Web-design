const path = require('node:path');

function databaseProvider(url) {
  if (typeof url === 'string' && /^postgres(?:ql)?:\/\//.test(url)) return 'postgresql';
  if (typeof url === 'string' && url.startsWith('file:')) return 'sqlite';
  throw new Error('DATABASE_URL phải là URL PostgreSQL/Supabase hoặc file: của SQLite.');
}
function schemaPath(url) {
  return path.join(__dirname, '../prisma', databaseProvider(url) === 'postgresql' ? 'schema.prisma' : 'schema.sqlite.prisma');
}
function createPrisma({ url = process.env.DATABASE_URL, ...options } = {}) {
  const provider = databaseProvider(url);
  const { PrismaClient } = require(`../generated/${provider}`);
  return new PrismaClient({ ...options, datasourceUrl: url });
}
module.exports = { databaseProvider, schemaPath, createPrisma };
