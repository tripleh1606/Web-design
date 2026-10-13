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
    { name: 'Bột matcha', unit: 'g', stock: 500 },
    { name: 'Bột houjicha', unit: 'g', stock: 400 },
    { name: 'Sữa tươi', unit: 'ml', stock: 2000 }
  ]
};

const recipesByDishName = {
  'Matcha Latte': [
    { ingredient: 'Bột matcha', amount: 10 },
    { ingredient: 'Sữa tươi', amount: 200 }
  ],
  'Matcha Cold Whisk': [
    { ingredient: 'Bột matcha', amount: 12 },
    { ingredient: 'Sữa tươi', amount: 180 }
  ],
  'Houjicha Latte': [
    { ingredient: 'Bột houjicha', amount: 10 },
    { ingredient: 'Sữa tươi', amount: 200 }
  ]
};

const chefDishesByName = {
  'Nguyễn Minh An': ['Matcha Latte', 'Matcha Cold Whisk'],
  'Trần Thu Hà': ['Houjicha Latte', 'Matcha Dâu']
};

async function upsertByName(model, rows) {
  for (const row of rows) {
    const existing = await prisma[model].findFirst({ where: { name: row.name } });
    if (!existing) {
      await prisma[model].create({ data: row });
    } else if (model === 'ingredient' && existing.stock !== row.stock) {
      await prisma.ingredient.update({ where: { id: existing.id }, data: { stock: row.stock } });
    }
  }
}

async function seedRecipes() {
  for (const [dishName, lines] of Object.entries(recipesByDishName)) {
    const dish = await prisma.dish.findFirst({ where: { name: dishName } });
    if (!dish) continue;
    for (const line of lines) {
      const ingredient = await prisma.ingredient.findFirst({ where: { name: line.ingredient } });
      if (!ingredient) continue;
      const existing = await prisma.dishIngredient.findUnique({
        where: { dishId_ingredientId: { dishId: dish.id, ingredientId: ingredient.id } }
      });
      if (!existing) {
        await prisma.dishIngredient.create({
          data: { dishId: dish.id, ingredientId: ingredient.id, amount: line.amount }
        });
      }
    }
  }
}

async function seedChefDishes() {
  for (const [chefName, dishNames] of Object.entries(chefDishesByName)) {
    const chef = await prisma.chef.findFirst({ where: { name: chefName } });
    if (!chef) continue;
    for (const dishName of dishNames) {
      const dish = await prisma.dish.findFirst({ where: { name: dishName } });
      if (!dish) continue;
      const existing = await prisma.chefDish.findUnique({
        where: { chefId_dishId: { chefId: chef.id, dishId: dish.id } }
      });
      if (!existing) {
        await prisma.chefDish.create({ data: { chefId: chef.id, dishId: dish.id } });
      }
    }
  }
}

async function main() {
  for (const [model, rows] of Object.entries(seedRows)) {
    await upsertByName(model, rows);
  }
  await seedRecipes();
  await seedChefDishes();
  console.log('Seeded dishes, chefs, ingredients, recipes and chef dishes.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error.name, error.code || 'UNKNOWN');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
