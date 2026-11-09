const path = require('path');
const { main: setupSearch } = require('../../scripts/setup-search');
function main() {
  return setupSearch({ schema: path.join(__dirname, '../prisma/schema.prisma'), envFile: path.join(__dirname, '../.env') });
}
if (require.main === module) {
  try { main(); }
  catch (error) { console.error('Search setup failed:', error.code || error.message); process.exitCode = 1; }
}
module.exports = { main };
