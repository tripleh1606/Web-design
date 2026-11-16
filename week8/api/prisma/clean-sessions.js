require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { createPrisma } = require('../src/database');
const { resolveAuthConfig } = require('../src/auth/config');

async function cleanSessions(prisma, config = resolveAuthConfig(), now = new Date()) {
  return prisma.session.deleteMany({ where: { OR: [
    { expiresAt: { lte: now } },
    { lastSeenAt: { lte: new Date(now.getTime() - config.sessionIdleMs) } }
  ] } });
}
if (require.main === module) {
  const prisma = createPrisma();
  cleanSessions(prisma, resolveAuthConfig({ appBaseUrl: process.env.SPA_ORIGIN || 'http://localhost:5173' }))
    .then(({ count }) => console.log(`Removed ${count} expired/idle session(s).`))
    .catch(() => { console.error('Session cleanup failed; no secrets logged.'); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
module.exports = { cleanSessions };
