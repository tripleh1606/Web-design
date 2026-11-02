require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Configure your PostgreSQL/Supabase URL in .env; see .env.example.');
  process.exit(1);
}
if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL)) {
  console.error('Week6 uses PostgreSQL/Supabase. DATABASE_URL must use postgres:// or postgresql://, not a SQLite file URL.');
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
