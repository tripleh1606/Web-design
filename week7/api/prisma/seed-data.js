const { drinks } = require('../src/soucha-menu');

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

module.exports = { seedRows, recipesByDishName, chefDishesByName };
