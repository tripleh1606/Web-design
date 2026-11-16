// Week 5 synthetic menu data, not scraped products or customer orders.
const DATASET_TAG = '[soucha-demo-beverages-v1]';
const categories = [
  { category: 'coffee', image: null, recipes: [
    ['Cà phê sữa', 28000], ['Coffee Latte', 35000], ['Cappuccino', 38000],
    ['Mocha', 42000], ['Latte caramel', 40000]
  ] },
  { category: 'matcha', image: '/beverages/matcha-latte.jpeg', recipes: [
    ['Matcha Latte', 35000], ['Matcha vani', 39000], ['Matcha caramel', 40000],
    ['Matcha mật ong', 39000], ['Matcha cacao', 42000]
  ] },
  { category: 'houjicha', image: '/beverages/houjicha-latte.jpeg', recipes: [
    ['Houjicha Latte', 32000], ['Houjicha vani', 36000], ['Houjicha caramel', 37000],
    ['Houjicha mật ong', 36000], ['Houjicha cacao', 39000]
  ] }
];
const milks = [
  ['sữa tươi', 0], ['sữa yến mạch', 8000],
  ['sữa hạnh nhân', 10000], ['sữa dừa', 6000]
];
const sugars = [0, 25, 50, 75, 100];
const temperatures = ['nóng', 'đá'];
const sizes = [['M', 0], ['L', 7000]];

function generateBeverages() {
  const rows = [];
  for (const group of categories) {
    for (const [recipe, basePrice] of group.recipes) {
      for (const [milk, milkPrice] of milks) {
        for (const sugar of sugars) {
          for (const temperature of temperatures) {
            for (const [size, sizePrice] of sizes) {
              rows.push({
                name: `${recipe} · ${milk} · ${temperature} · ${size} · ${sugar}% đường`,
                description: `${DATASET_TAG} Món giả lập để kiểm tra tìm kiếm, lọc và sắp xếp. ${recipe} pha với ${milk}, dùng ${temperature}, cỡ ${size}, mức đường ${sugar}%. Không phải sản phẩm hoặc đơn hàng thực tế.`,
                category: group.category,
                price: basePrice + milkPrice + sizePrice,
                image: group.image,
                available: rows.length % 11 !== 0
              });
            }
          }
        }
      }
    }
  }
  return rows;
}

function summary(rows) {
  return {
    total: rows.length,
    categories: Object.fromEntries(categories.map(({ category }) => [category, rows.filter((row) => row.category === category).length])),
    minPrice: Math.min(...rows.map((row) => row.price)),
    maxPrice: Math.max(...rows.map((row) => row.price))
  };
}

module.exports = { DATASET_TAG, generateBeverages, summary };
