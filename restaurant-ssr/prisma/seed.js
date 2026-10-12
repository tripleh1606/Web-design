require('dotenv').config();
const { PrismaClient } = require('../generated/prisma');
const { drinks } = require('../src/soucha-menu');

const prisma = new PrismaClient();

const seedRows = {
  dish: drinks.map((drink) => ({ ...drink, description: null, available: true })),
  chef: [
    { name: 'Nguyễn Minh An', specialty: 'Món Việt truyền thống' },
    { name: 'Trần Thu Hà', specialty: 'Món khai vị' }
  ],
  ingredient: [
    { name: 'Bột matcha', unit: 'g' },
    { name: 'Bột houjicha', unit: 'g' },
    { name: 'Sữa tươi', unit: 'ml' }
  ]
};

async function main() {
  for (const [model, rows] of Object.entries(seedRows)) {
    for (const row of rows) {
      const existing = await prisma[model].findFirst({ where: { name: row.name } });
      if (!existing) await prisma[model].create({ data: row });
    }
  }
  console.log('Seeded dishes, chefs and ingredients.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error.name, error.code || 'UNKNOWN');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
