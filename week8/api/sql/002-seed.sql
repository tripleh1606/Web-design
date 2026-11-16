-- UTF-8 PostgreSQL seed from week3/restaurant: dishes, chefs, ingredients and both relations.

-- Existing rows are preserved; this file inserts missing sample data only.

BEGIN;

INSERT INTO "dishes" ("name", "category", "price", "image", "description", "available") SELECT 'Matcha Latte', 'matcha', 30000, '/beverages/matcha-latte.jpeg', NULL, TRUE WHERE NOT EXISTS (SELECT 1 FROM "dishes" WHERE "name" = 'Matcha Latte');

INSERT INTO "dishes" ("name", "category", "price", "image", "description", "available") SELECT 'Matcha Cold Whisk', 'matcha', 32000, '/beverages/matcha-cold-whisk.jpeg', NULL, TRUE WHERE NOT EXISTS (SELECT 1 FROM "dishes" WHERE "name" = 'Matcha Cold Whisk');

INSERT INTO "dishes" ("name", "category", "price", "image", "description", "available") SELECT 'Matcha Dâu', 'matcha', 37000, '/beverages/matcha-dau.jpeg', NULL, TRUE WHERE NOT EXISTS (SELECT 1 FROM "dishes" WHERE "name" = 'Matcha Dâu');

INSERT INTO "dishes" ("name", "category", "price", "image", "description", "available") SELECT 'Matcha Caramel', 'matcha', 35000, '/beverages/matcha-caramel.jpeg', NULL, TRUE WHERE NOT EXISTS (SELECT 1 FROM "dishes" WHERE "name" = 'Matcha Caramel');

INSERT INTO "dishes" ("name", "category", "price", "image", "description", "available") SELECT 'Matcha Oreo Kem Cheese Dẻo', 'matcha', 44000, '/beverages/matcha-oreo.jpeg', NULL, TRUE WHERE NOT EXISTS (SELECT 1 FROM "dishes" WHERE "name" = 'Matcha Oreo Kem Cheese Dẻo');

INSERT INTO "dishes" ("name", "category", "price", "image", "description", "available") SELECT 'Matcha Kem Muối', 'matcha', 40000, '/beverages/matcha-kem-muoi.jpeg', NULL, TRUE WHERE NOT EXISTS (SELECT 1 FROM "dishes" WHERE "name" = 'Matcha Kem Muối');

INSERT INTO "dishes" ("name", "category", "price", "image", "description", "available") SELECT 'Houjicha Latte', 'houjicha', 30000, '/beverages/houjicha-latte.jpeg', NULL, TRUE WHERE NOT EXISTS (SELECT 1 FROM "dishes" WHERE "name" = 'Houjicha Latte');

INSERT INTO "dishes" ("name", "category", "price", "image", "description", "available") SELECT 'Houjicha Cold Whisk', 'houjicha', 32000, '/beverages/houjicha-cold-whisk.jpeg', NULL, TRUE WHERE NOT EXISTS (SELECT 1 FROM "dishes" WHERE "name" = 'Houjicha Cold Whisk');

INSERT INTO "chefs" ("name", "specialty") SELECT 'Nguyễn Minh An', 'Món Việt truyền thống' WHERE NOT EXISTS (SELECT 1 FROM "chefs" WHERE "name" = 'Nguyễn Minh An');

INSERT INTO "chefs" ("name", "specialty") SELECT 'Trần Thu Hà', 'Món khai vị' WHERE NOT EXISTS (SELECT 1 FROM "chefs" WHERE "name" = 'Trần Thu Hà');

INSERT INTO "ingredients" ("name", "unit", "stock") SELECT 'Bột matcha', 'g', 500 WHERE NOT EXISTS (SELECT 1 FROM "ingredients" WHERE "name" = 'Bột matcha');

INSERT INTO "ingredients" ("name", "unit", "stock") SELECT 'Bột houjicha', 'g', 400 WHERE NOT EXISTS (SELECT 1 FROM "ingredients" WHERE "name" = 'Bột houjicha');

INSERT INTO "ingredients" ("name", "unit", "stock") SELECT 'Sữa tươi', 'ml', 2000 WHERE NOT EXISTS (SELECT 1 FROM "ingredients" WHERE "name" = 'Sữa tươi');

INSERT INTO "dish_ingredients" ("dishId", "ingredientId", "amount") SELECT d.id, i.id, 10 FROM (SELECT id FROM dishes WHERE name = 'Matcha Latte' ORDER BY id LIMIT 1) d CROSS JOIN (SELECT id FROM ingredients WHERE name = 'Bột matcha' ORDER BY id LIMIT 1) i ON CONFLICT ("dishId", "ingredientId") DO NOTHING;

INSERT INTO "dish_ingredients" ("dishId", "ingredientId", "amount") SELECT d.id, i.id, 200 FROM (SELECT id FROM dishes WHERE name = 'Matcha Latte' ORDER BY id LIMIT 1) d CROSS JOIN (SELECT id FROM ingredients WHERE name = 'Sữa tươi' ORDER BY id LIMIT 1) i ON CONFLICT ("dishId", "ingredientId") DO NOTHING;

INSERT INTO "dish_ingredients" ("dishId", "ingredientId", "amount") SELECT d.id, i.id, 12 FROM (SELECT id FROM dishes WHERE name = 'Matcha Cold Whisk' ORDER BY id LIMIT 1) d CROSS JOIN (SELECT id FROM ingredients WHERE name = 'Bột matcha' ORDER BY id LIMIT 1) i ON CONFLICT ("dishId", "ingredientId") DO NOTHING;

INSERT INTO "dish_ingredients" ("dishId", "ingredientId", "amount") SELECT d.id, i.id, 180 FROM (SELECT id FROM dishes WHERE name = 'Matcha Cold Whisk' ORDER BY id LIMIT 1) d CROSS JOIN (SELECT id FROM ingredients WHERE name = 'Sữa tươi' ORDER BY id LIMIT 1) i ON CONFLICT ("dishId", "ingredientId") DO NOTHING;

INSERT INTO "dish_ingredients" ("dishId", "ingredientId", "amount") SELECT d.id, i.id, 10 FROM (SELECT id FROM dishes WHERE name = 'Houjicha Latte' ORDER BY id LIMIT 1) d CROSS JOIN (SELECT id FROM ingredients WHERE name = 'Bột houjicha' ORDER BY id LIMIT 1) i ON CONFLICT ("dishId", "ingredientId") DO NOTHING;

INSERT INTO "dish_ingredients" ("dishId", "ingredientId", "amount") SELECT d.id, i.id, 200 FROM (SELECT id FROM dishes WHERE name = 'Houjicha Latte' ORDER BY id LIMIT 1) d CROSS JOIN (SELECT id FROM ingredients WHERE name = 'Sữa tươi' ORDER BY id LIMIT 1) i ON CONFLICT ("dishId", "ingredientId") DO NOTHING;

INSERT INTO "chef_dishes" ("chefId", "dishId") SELECT c.id, d.id FROM (SELECT id FROM chefs WHERE name = 'Nguyễn Minh An' ORDER BY id LIMIT 1) c CROSS JOIN (SELECT id FROM dishes WHERE name = 'Matcha Latte' ORDER BY id LIMIT 1) d ON CONFLICT ("chefId", "dishId") DO NOTHING;

INSERT INTO "chef_dishes" ("chefId", "dishId") SELECT c.id, d.id FROM (SELECT id FROM chefs WHERE name = 'Nguyễn Minh An' ORDER BY id LIMIT 1) c CROSS JOIN (SELECT id FROM dishes WHERE name = 'Matcha Cold Whisk' ORDER BY id LIMIT 1) d ON CONFLICT ("chefId", "dishId") DO NOTHING;

INSERT INTO "chef_dishes" ("chefId", "dishId") SELECT c.id, d.id FROM (SELECT id FROM chefs WHERE name = 'Trần Thu Hà' ORDER BY id LIMIT 1) c CROSS JOIN (SELECT id FROM dishes WHERE name = 'Houjicha Latte' ORDER BY id LIMIT 1) d ON CONFLICT ("chefId", "dishId") DO NOTHING;

INSERT INTO "chef_dishes" ("chefId", "dishId") SELECT c.id, d.id FROM (SELECT id FROM chefs WHERE name = 'Trần Thu Hà' ORDER BY id LIMIT 1) c CROSS JOIN (SELECT id FROM dishes WHERE name = 'Matcha Dâu' ORDER BY id LIMIT 1) d ON CONFLICT ("chefId", "dishId") DO NOTHING;

COMMIT;

