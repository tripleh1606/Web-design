const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { seedRows, recipesByDishName, chefDishesByName } = require('../api/prisma/seed-data');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'api/sql');
fs.mkdirSync(output, { recursive: true });
const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.join(root, 'api/prisma/schema.prisma'), '--script'], {
  cwd: root, encoding: 'utf8', env: { ...process.env, RUST_LOG: 'info' }
});
if (result.status !== 0) { console.error('Không xuất được schema SQL.'); process.exit(result.status || 1); }
const searchSetup = fs.readFileSync(path.join(root, 'api/prisma/search-setup.sql'), 'utf8');
fs.writeFileSync(path.join(output, '001-schema.sql'), '-- PostgreSQL / Supabase core schema with Week 5 search support.\n-- Run this file only for a NEW empty database; existing databases use db:search-setup.\n\nCREATE EXTENSION IF NOT EXISTS pg_trgm;\n\n' + result.stdout + '\n' + searchSetup, 'utf8');
const literal = (value) => value === null ? 'NULL' : typeof value === 'boolean' ? String(value).toUpperCase() : typeof value === 'number' ? String(value) : "'" + value.replaceAll("'", "''") + "'";
const statements = [
  '-- UTF-8 PostgreSQL seed from week3/restaurant: dishes, chefs, ingredients and both relations.',
  '-- Existing rows are preserved; this file inserts missing sample data only.',
  'BEGIN;'
];
for (const [model, table] of [['dish', 'dishes'], ['chef', 'chefs'], ['ingredient', 'ingredients']]) {
  for (const row of seedRows[model]) {
    const columns = Object.keys(row).map((key) => '"' + key + '"').join(', ');
    statements.push(`INSERT INTO "${table}" (${columns}) SELECT ${Object.values(row).map(literal).join(', ')} WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE "name" = ${literal(row.name)});`);
  }
}
for (const [name, lines] of Object.entries(recipesByDishName)) {
  for (const line of lines) statements.push(`INSERT INTO "dish_ingredients" ("dishId", "ingredientId", "amount") SELECT d.id, i.id, ${line.amount} FROM (SELECT id FROM dishes WHERE name = ${literal(name)} ORDER BY id LIMIT 1) d CROSS JOIN (SELECT id FROM ingredients WHERE name = ${literal(line.ingredient)} ORDER BY id LIMIT 1) i ON CONFLICT ("dishId", "ingredientId") DO NOTHING;`);
}
for (const [name, dishes] of Object.entries(chefDishesByName)) {
  for (const dish of dishes) statements.push(`INSERT INTO "chef_dishes" ("chefId", "dishId") SELECT c.id, d.id FROM (SELECT id FROM chefs WHERE name = ${literal(name)} ORDER BY id LIMIT 1) c CROSS JOIN (SELECT id FROM dishes WHERE name = ${literal(dish)} ORDER BY id LIMIT 1) d ON CONFLICT ("chefId", "dishId") DO NOTHING;`);
}
statements.push('COMMIT;', '');
fs.writeFileSync(path.join(output, '002-seed.sql'), statements.join('\n\n'), 'utf8');
console.log('Exported api/sql/001-schema.sql and api/sql/002-seed.sql (no database connection required).');
