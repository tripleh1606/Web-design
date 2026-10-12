require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Copy .env.example to .env and set your Supabase Session pooler URL.');
  process.exit(1);
}

const { PrismaClient } = require('./generated/prisma');
const { createApp } = require('./src/app');

const prisma = new PrismaClient();
const app = createApp({ prisma });
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, () => console.log(`Restaurant SSR listening on http://localhost:${port}/dishes`));

async function close() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
