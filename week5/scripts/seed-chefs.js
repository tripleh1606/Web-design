const path = require('node:path');
const { chefRows } = require('../api/prisma/chef-roster');
const { validate } = require('../api/src/validation');
const identity = (name) => name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');

async function seedChefs(prisma, { apply = false } = {}) {
  if (chefRows.length !== 28 || new Set(chefRows.map((row) => identity(row.name))).size !== 28 ||
      chefRows.some((row) => Object.keys(validate('chefs', row).fields).length)) throw new Error('INVALID_CHEF_ROSTER');
  return prisma.$transaction(async (tx) => {
    const existing = await tx.chef.findMany({ select: { name: true } });
    const known = new Set(existing.map((row) => identity(row.name)));
    const missing = chefRows.filter((row) => !known.has(identity(row.name)));
    if (apply && missing.length) await tx.chef.createMany({ data: missing });
    return { mode: apply ? 'applied' : 'dry-run', total: chefRows.length,
      existing: chefRows.length - missing.length, inserted: apply ? missing.length : 0,
      pending: apply ? 0 : missing.length, databaseBefore: existing.length,
      databaseAfter: await tx.chef.count() };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--preview', '--apply'].includes(arg))) throw new Error('UNKNOWN_ARGUMENT');
  if (args.includes('--preview')) return console.log(JSON.stringify(chefRows, null, 2));
  require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
  const { createPrisma } = require('../api/src/database');
  const prisma = createPrisma();
  try { console.log(JSON.stringify(await seedChefs(prisma, { apply: args.includes('--apply') }), null, 2)); }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch((error) => {
  console.error('Chef import failed:', error.code || error.name);
  process.exitCode = 1;
});
module.exports = { seedChefs };
