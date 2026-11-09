// Ported from Soucha/lib/menu.ts (DRINKS) and its original product migration.
const drinks = [
  { name: 'Matcha Latte', category: 'matcha', price: 30000, image: '/beverages/matcha-latte.jpeg' },
  { name: 'Matcha Cold Whisk', category: 'matcha', price: 32000, image: '/beverages/matcha-cold-whisk.jpeg' },
  { name: 'Matcha Dâu', category: 'matcha', price: 37000, image: '/beverages/matcha-dau.jpeg' },
  { name: 'Matcha Caramel', category: 'matcha', price: 35000, image: '/beverages/matcha-caramel.jpeg' },
  { name: 'Matcha Oreo Kem Cheese Dẻo', category: 'matcha', price: 44000, image: '/beverages/matcha-oreo.jpeg' },
  { name: 'Matcha Kem Muối', category: 'matcha', price: 40000, image: '/beverages/matcha-kem-muoi.jpeg' },
  { name: 'Houjicha Latte', category: 'houjicha', price: 30000, image: '/beverages/houjicha-latte.jpeg' },
  { name: 'Houjicha Cold Whisk', category: 'houjicha', price: 32000, image: '/beverages/houjicha-cold-whisk.jpeg' }
];

const categories = [
  { id: 'matcha', name: 'Matcha' },
  { id: 'houjicha', name: 'Houjicha' }
];

const categoryLabel = (id) => categories.find((entry) => entry.id === id)?.name || id || 'Món khác';
const formatVND = (value) => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;

module.exports = { drinks, categories, categoryLabel, formatVND };
