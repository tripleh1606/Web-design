const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createPrisma, databaseProvider } = require('./src/database');
const { createApp } = require('./src/app');
const prisma = createPrisma();
const app = createApp({ prisma, spaOrigin: process.env.SPA_ORIGIN || 'http://localhost:5173' });
const server = app.listen(Number(process.env.PORT || 3001), () => console.log('Soucha API ready on port', server.address().port, '(' + databaseProvider(process.env.DATABASE_URL) + ')'));
async function shutdown() {
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
