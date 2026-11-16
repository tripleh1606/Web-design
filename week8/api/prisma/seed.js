require('dotenv').config();
const { createPrisma } = require('../src/database');


const prisma = createPrisma();

const { seedRows, recipesByDishName, chefDishesByName } = require('./seed-data');

async function upsertByName(model, rows) {
  for (const row of rows) {
    const existing = await prisma[model].findFirst({ where: { name: row.name } });
    if (!existing) {
      await prisma[model].create({ data: row });
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
