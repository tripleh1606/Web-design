require('dotenv').config();
const { PrismaClient } = require('../generated/prisma');
const { drinks } = require('../src/soucha-menu');

const prisma = new PrismaClient();

const testFixtureDishes = [
  {
    name: 'Trà dùng thử 0đ',
    category: 'tea',
    price: 0,
    available: true,
    description: 'Món trà dùng thử 0 đồng đặc biệt cho khách hàng mới trải nghiệm.',
    image: null
  },
  {
    name: 'Matcha 100% nguyên chất',
    category: 'matcha',
    price: 35000,
    available: true,
    description: 'Bột matcha thượng hạng 100% nguyên chất từ Nhật Bản không pha tạp chất.',
    image: '/beverages/matcha-latte.jpeg'
  },
  {
    name: 'Hồng trà _ đặc biệt',
    category: 'tea',
    price: 30000,
    available: true,
    description: 'Hồng trà ủ lạnh với công thức đặc biệt có ký tự gạch dưới _ trong tên gọi.',
    image: null
  },
  {
    name: 'Trà Ô Long Tuyết Sơn!',
    category: 'tea',
    price: 32000,
    available: true,
    description: 'Trà Ô Long Tuyết Sơn hái từ đỉnh núi cao với dấu chấm than!',
    image: null
  },
  {
    name: 'Cà phê sữa đá pha phin truyền thống',
    category: 'coffee',
    price: 25000,
    available: true,
    description: 'Cà phê sữa đá pha phin đậm đà hương vị truyền thống Sài Gòn uống cùng sữa tươi nóng hoặc lạnh.',
    image: null
  },
  {
    name: 'Cà phê muối đóng chai',
    category: 'coffee',
    price: 30000,
    available: false,
    description: 'Cà phê muối đóng chai bảo quản lạnh tạm thời hết hàng.',
    image: null
  }
];

function generateSyntheticDishes() {
  const categories = [
    {
      category: 'coffee',
      image: null,
      bases: [
        { name: 'Cà phê sữa', basePrice: 28000 },
        { name: 'Coffee Latte', basePrice: 35000 },
        { name: 'Cappuccino', basePrice: 35000 },
        { name: 'Mocha', basePrice: 38000 },
        { name: 'Latte caramel', basePrice: 38000 }
      ]
    },
    {
      category: 'matcha',
      image: '/beverages/matcha-latte.jpeg',
      bases: [
        { name: 'Matcha Latte', basePrice: 39000 },
        { name: 'Matcha vani', basePrice: 39000 },
        { name: 'Matcha caramel', basePrice: 41000 },
        { name: 'Matcha mật ong', basePrice: 41000 },
        { name: 'Matcha cacao', basePrice: 45000 }
      ]
    },
    {
      category: 'houjicha',
      image: '/beverages/houjicha-latte.jpeg',
      bases: [
        { name: 'Houjicha Latte', basePrice: 36000 },
        { name: 'Houjicha vani', basePrice: 36000 },
        { name: 'Houjicha caramel', basePrice: 38000 },
        { name: 'Houjicha mật ong', basePrice: 38000 },
        { name: 'Houjicha cacao', basePrice: 42000 }
      ]
    }
  ];

  const milks = [
    { name: 'sữa tươi', delta: 0 },
    { name: 'sữa yến mạch', delta: 5000 },
    { name: 'sữa hạnh nhân', delta: 5000 },
    { name: 'sữa dừa', delta: 3000 }
  ];

  const temps = ['nóng', 'đá'];
  const sizes = [
    { name: 'M', delta: 0 },
    { name: 'L', delta: 7000 }
  ];
  const sugars = ['0% đường', '25% đường', '50% đường', '75% đường', '100% đường'];

  const results = [];
  let index = 0;

  for (const cat of categories) {
    for (const base of cat.bases) {
      for (const milk of milks) {
        for (const temp of temps) {
          for (const size of sizes) {
            for (const sugar of sugars) {
              const name = `${base.name} · ${milk.name} · ${temp} · ${size.name} · ${sugar}`;
              const price = base.basePrice + milk.delta + size.delta;
              const available = index % 11 !== 0;
              const description = `[soucha-demo-beverages-v1] Món giả lập để kiểm tra tìm kiếm, lọc và sắp xếp. ${base.name} pha với ${milk.name}, dùng ${temp}, cỡ ${size.name}, mức đường ${sugar}. Không phải sản phẩm hoặc đơn hàng thực tế.`;
              results.push({
                name,
                description,
                price,
                category: cat.category,
                image: cat.image,
                available
              });
              index++;
            }
          }
        }
      }
    }
  }

  return results;
}

const seedRows = {
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

async function seedDishes() {
  const originalDrinks = drinks.map((drink) => ({
    ...drink,
    description: null,
    available: true
  }));

  const syntheticDishes = generateSyntheticDishes();
  const allDishesToSeed = [
    ...originalDrinks,
    ...testFixtureDishes,
    ...syntheticDishes
  ];

  console.log(`Checking existing dishes in database (target: ${allDishesToSeed.length} items)...`);
  const existingDishes = await prisma.dish.findMany({ select: { id: true, name: true } });
  const existingMap = new Map(existingDishes.map((d) => [d.name, d.id]));

  const toCreate = [];
  for (const dish of allDishesToSeed) {
    if (!existingMap.has(dish.name)) {
      toCreate.push(dish);
      // Mark as seen so duplicates inside allDishesToSeed are avoided
      existingMap.set(dish.name, -1);
    }
  }

  if (toCreate.length > 0) {
    console.log(`Inserting ${toCreate.length} new dishes in batches...`);
    const chunkSize = 400;
    for (let i = 0; i < toCreate.length; i += chunkSize) {
      const chunk = toCreate.slice(i, i + chunkSize);
      await prisma.dish.createMany({ data: chunk });
    }
    console.log(`Inserted ${toCreate.length} dishes.`);
  } else {
    console.log('All dishes already exist. Checking test fixtures for updates...');
  }

  // Ensure test fixtures have exact attributes
  for (const fixture of testFixtureDishes) {
    const existing = await prisma.dish.findFirst({ where: { name: fixture.name } });
    if (existing) {
      await prisma.dish.update({
        where: { id: existing.id },
        data: {
          price: fixture.price,
          available: fixture.available,
          description: fixture.description,
          category: fixture.category
        }
      });
    }
  }

  const finalCount = await prisma.dish.count();
  console.log(`Current total dishes in database: ${finalCount}`);
}

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
  await seedDishes();
  for (const [model, rows] of Object.entries(seedRows)) {
    await upsertByName(model, rows);
  }
  await seedRecipes();
  await seedChefDishes();
  console.log('Seeded dishes, chefs, ingredients, recipes and chef dishes successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
