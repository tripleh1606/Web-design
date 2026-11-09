require('dotenv').config();
const assert = require('node:assert/strict');
const { PrismaClient } = require('../generated/prisma');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('--- STARTING VERIFICATION GROUP A (Database & Seed) ---');

    // TC DB-01: Số lượng bản ghi trong Supabase
    const totalDishes = await prisma.dish.count();
    console.log(`[DB-01] Total dishes: ${totalDishes}`);
    assert.ok(totalDishes >= 1000, `Expected totalDishes >= 1000, got ${totalDishes}`);

    // TC DB-02: Extension pg_trgm đã bật
    const extensions = await prisma.$queryRawUnsafe(
      "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'"
    );
    console.log(`[DB-02] pg_trgm extension check:`, extensions);
    assert.equal(extensions.length, 1, 'pg_trgm extension is not installed');
    assert.equal(extensions[0].extname, 'pg_trgm');

    // TC DB-03: Cột fts và GIN Indexes tồn tại
    const ftsColumn = await prisma.$queryRawUnsafe(
      "SELECT column_name, data_type, is_generated FROM information_schema.columns WHERE table_name = 'dishes' AND column_name = 'fts'"
    );
    console.log(`[DB-03] fts column check:`, ftsColumn);
    assert.equal(ftsColumn.length, 1, 'Column fts does not exist in dishes');
    assert.equal(ftsColumn[0].data_type, 'tsvector');
    assert.equal(ftsColumn[0].is_generated, 'ALWAYS');

    const indexes = await prisma.$queryRawUnsafe(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'dishes'"
    );
    const indexNames = indexes.map((idx) => idx.indexname);
    console.log(`[DB-03] Indexes on dishes:`, indexNames);

    const ftsIdx = indexes.find((i) => i.indexname === 'dishes_fts_idx');
    assert.ok(ftsIdx, 'dishes_fts_idx does not exist');
    assert.match(ftsIdx.indexdef, /USING gin \(fts\)/i);

    const trgmIdx = indexes.find((i) => i.indexname === 'dishes_name_trgm_idx');
    assert.ok(trgmIdx, 'dishes_name_trgm_idx does not exist');
    assert.match(trgmIdx.indexdef, /USING gin \(name gin_trgm_ops\)/i);

    const advIdx = indexes.find((i) => i.indexname === 'dishes_adv_filter_idx');
    assert.ok(advIdx, 'dishes_adv_filter_idx does not exist');

    // TC DB-04: Xử lý description IS NULL trong fts
    const nullDescDish = await prisma.dish.findFirst({
      where: { description: null, name: 'Matcha Latte' }
    });
    assert.ok(nullDescDish, 'Matcha Latte with null description not found');
    const ftsVal = await prisma.$queryRawUnsafe(
      `SELECT id, name, description, fts::text FROM dishes WHERE id = ${nullDescDish.id}`
    );
    console.log(`[DB-04] Matcha Latte (description = null) fts vector:`, ftsVal[0]?.fts);
    assert.ok(ftsVal[0]?.fts, 'fts value should not be null for null description');
    assert.match(ftsVal[0].fts, /'matcha':1A/);
    assert.match(ftsVal[0].fts, /'latte':2A/);

    // Predictable Test Fixtures
    console.log('--- CHECKING TEST FIXTURES ---');

    // 1. price = 0
    const zeroPrice = await prisma.dish.findFirst({ where: { name: 'Trà dùng thử 0đ' } });
    assert.ok(zeroPrice, 'Dish "Trà dùng thử 0đ" not found');
    assert.equal(zeroPrice.price, 0);
    assert.equal(zeroPrice.available, true);
    console.log('✓ Found price = 0 dish:', zeroPrice.name);

    // 2. price = 30000 (multiple dishes)
    const thirtyKDishes = await prisma.dish.findMany({ where: { price: 30000 } });
    assert.ok(thirtyKDishes.length >= 2, 'Expected multiple dishes with price = 30000');
    console.log(`✓ Found ${thirtyKDishes.length} dishes with price = 30000`);

    // 3. available = false and available = true
    const availableFalse = await prisma.dish.findFirst({ where: { available: false } });
    assert.ok(availableFalse, 'Expected at least one dish with available = false');
    const availableTrue = await prisma.dish.findFirst({ where: { available: true } });
    assert.ok(availableTrue, 'Expected at least one dish with available = true');
    console.log('✓ Found both available = true and available = false dishes');

    // 4. Special characters: %, _, !
    const pctDish = await prisma.dish.findFirst({ where: { name: 'Matcha 100% nguyên chất' } });
    assert.ok(pctDish, 'Dish "Matcha 100% nguyên chất" not found');
    console.log('✓ Found dish with %:', pctDish.name);

    const underDish = await prisma.dish.findFirst({ where: { name: 'Hồng trà _ đặc biệt' } });
    assert.ok(underDish, 'Dish "Hồng trà _ đặc biệt" not found');
    console.log('✓ Found dish with _:', underDish.name);

    const exclDish = await prisma.dish.findFirst({ where: { name: 'Trà Ô Long Tuyết Sơn!' } });
    assert.ok(exclDish, 'Dish "Trà Ô Long Tuyết Sơn!" not found');
    console.log('✓ Found dish with !:', exclDish.name);

    // 5. Dish with multi-word description for fulltext
    const ftDish = await prisma.dish.findFirst({ where: { name: 'Cà phê sữa đá pha phin truyền thống' } });
    assert.ok(ftDish, 'Dish "Cà phê sữa đá pha phin truyền thống" not found');
    console.log('✓ Found dish with rich description for fulltext:', ftDish.description);

    // 6. Fuzzy candidate
    const fuzzyDish = await prisma.dish.findFirst({ where: { name: 'Houjicha Latte' } });
    assert.ok(fuzzyDish, 'Dish "Houjicha Latte" not found');
    console.log('✓ Found fuzzy candidate dish:', fuzzyDish.name);

    // Relations check (chefs, ingredients, recipes, chef_dishes)
    const chefsCount = await prisma.chef.count();
    const ingredientsCount = await prisma.ingredient.count();
    const recipesCount = await prisma.dishIngredient.count();
    const chefDishesCount = await prisma.chefDish.count();
    console.log(
      `✓ Relations intact: ${chefsCount} chefs, ${ingredientsCount} ingredients, ${recipesCount} recipes, ${chefDishesCount} chef_dishes`
    );
    assert.ok(chefsCount >= 2);
    assert.ok(ingredientsCount >= 3);
    assert.ok(recipesCount >= 3);
    assert.ok(chefDishesCount >= 3);

    console.log('--- ALL PHASE 1 VERIFICATION CHECKS PASSED! ---');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
