require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../generated/prisma');

async function main() {
  const prisma = new PrismaClient();
  try {
    const sqlPath = path.join(__dirname, '../prisma/search-setup.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Executing search-setup.sql on database...');

    // Split statements by semicolon (ignoring empty lines/comments)
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      console.log(`Running statement:\n${stmt.substring(0, 60)}...`);
      await prisma.$executeRawUnsafe(stmt);
    }

    console.log('Search setup SQL executed successfully!');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error executing search setup:', err);
    process.exit(1);
  });
}

module.exports = { main };
