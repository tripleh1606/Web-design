const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../api/.env') });
const { createPrisma, databaseProvider } = require('../api/src/database');

async function main() {
  const provider = databaseProvider(process.env.DATABASE_URL);
  if (/PROJECT_REF|YOUR_PASSWORD/.test(process.env.DATABASE_URL)) throw new Error('PLACEHOLDER_URL');
  const prisma = createPrisma();
  try {
    const [dishes, chefs, ingredients, recipes, assignments] = await Promise.all([
      prisma.dish.count(), prisma.chef.count(), prisma.ingredient.count(), prisma.dishIngredient.count(), prisma.chefDish.count()
    ]);
    console.log(JSON.stringify({ connected: true, provider, dishes, chefs, ingredients, recipes, assignments, readOnly: true }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => {
  console.error('Database smoke test failed:', error.code || error.name);
  console.error('Kiểm tra DATABASE_URL và chạy npm run setup nếu database mới chưa có bảng.');
  process.exitCode = 1;
});
