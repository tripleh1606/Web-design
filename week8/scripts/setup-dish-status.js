const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../api/.env') });
const { createPrisma, databaseProvider } = require('../api/src/database');

async function main() {
  if (databaseProvider(process.env.DATABASE_URL) !== 'postgresql') throw new Error('This migration requires PostgreSQL.');
  const prisma = createPrisma();
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, '../api/sql/005-dish-status.sql'), 'utf8');
    if (!sql.replace(/^\s*--.*$/gm, '').trim()) throw new Error('Dish status migration is empty.');
    await prisma.$executeRawUnsafe(sql);
    const columns = await prisma.$queryRaw`SELECT data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dishes' AND column_name = 'status'`;
    if (columns.length !== 1 || columns[0].data_type !== 'text' || columns[0].is_nullable !== 'NO') {
      throw new Error('Unexpected dishes.status definition; review the database schema.');
    }
    console.log('dishes.status ready; existing dishes and assignments preserved.');
  } finally { await prisma.$disconnect(); }
}
main().catch(error => {
  console.error('Dish status setup failed:', /Prisma/.test(error.name) ? error.name + ' ' + (error.code || '') : error.message);
  process.exitCode = 1;
});
