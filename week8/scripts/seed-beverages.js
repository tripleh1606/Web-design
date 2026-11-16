const path = require('node:path');
const { DATASET_TAG, generateBeverages, summary } = require('../api/prisma/demo-beverages');
const { validate } = require('../api/src/validation');

function checkedRows() {
  const rows = generateBeverages();
  if (rows.length !== 1200 || new Set(rows.map((row) => row.name)).size !== rows.length) {
    throw new Error('DEMO_DATASET_INVALID');
  }
  for (const row of rows) {
    if (Object.keys(validate('dishes', row).fields).length) throw new Error('DEMO_ROW_INVALID');
  }
  return rows;
}

// Week 5 import: no delete/update or schema changes; repeat runs add only missing names.
// Serializable isolation prevents concurrent runs from both inserting the same set.
async function seedBeverages(prisma, { apply = false } = {}) {
  const rows = checkedRows();
  return prisma.$transaction(async (tx) => {
    const names = rows.map((row) => row.name);
    const existing = await tx.dish.findMany({
      where: { name: { in: names } }, select: { name: true, description: true }
    });
    if (existing.some((row) => !row.description?.startsWith(DATASET_TAG))) {
      throw new Error('NAME_COLLISION_WITH_EXISTING_DATA');
    }
    const existingNames = new Set(existing.map((row) => row.name));
    const missing = rows.filter((row) => !existingNames.has(row.name));
    const before = await tx.dish.count();
    if (apply && missing.length) await tx.dish.createMany({ data: missing });
    const after = await tx.dish.count();
    if (after !== before + (apply ? missing.length : 0)) throw new Error('DEMO_COUNT_MISMATCH');
    return {
      mode: apply ? 'applied' : 'dry-run',
      dataset: DATASET_TAG,
      ...summary(rows),
      existing: existingNames.size,
      pending: missing.length,
      inserted: apply ? missing.length : 0,
      databaseBefore: before,
      databaseAfter: after
    };
  }, { isolationLevel: 'Serializable', maxWait: 15000, timeout: 120000 });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--apply', '--preview'].includes(arg))) throw new Error('UNKNOWN_ARGUMENT');
  if (args.includes('--preview')) {
    const rows = checkedRows();
    console.log(JSON.stringify({ mode: 'preview', ...summary(rows), samples: rows.filter((_, index) => index % 400 === 0) }, null, 2));
    return;
  }
  // The API's own env is the only configuration file used for this import.
  require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
  const { createPrisma } = require('../api/src/database');
  const prisma = createPrisma();
  try {
    console.log(JSON.stringify(await seedBeverages(prisma, { apply: args.includes('--apply') }), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Prisma error messages may contain database credentials; report safe codes only.
    console.error('Beverage seed failed:', error.code || error.name);
    if (['NAME_COLLISION_WITH_EXISTING_DATA', 'DEMO_DATASET_INVALID', 'DEMO_ROW_INVALID', 'DEMO_COUNT_MISMATCH', 'UNKNOWN_ARGUMENT'].includes(error.message)) console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { seedBeverages, checkedRows };
