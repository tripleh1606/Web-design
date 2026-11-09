require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Copy .env.example to .env and set your Supabase Session pooler URL.');
  process.exit(1);
}

const { PrismaClient } = require('./generated/prisma');
const { createApp } = require('./src/app');

const corsOrigin = String(process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
if (!corsOrigin || corsOrigin === '*') {
  console.error('CORS_ORIGIN must be the SPA origin, for example http://localhost:5173');
  process.exit(1);
}

const prisma = new PrismaClient();
const app = createApp({ prisma, corsOrigin });
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, () => {
  console.log(`Restaurant API listening on http://localhost:${port}`);
  console.log(`CORS origin ${corsOrigin}`);
});

async function close() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
