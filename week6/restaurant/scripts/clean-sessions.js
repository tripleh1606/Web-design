require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../generated/prisma');
const { resolveAuthConfig } = require('../src/auth/config');

async function cleanSessions(prisma, config = resolveAuthConfig(), now = new Date()) {
  return prisma.session.deleteMany({ where: { OR: [
    { expiresAt: { lte: now } },
    { lastSeenAt: { lte: new Date(now.getTime() - config.sessionIdleMs) } }
  ] } });
}
if (require.main === module) {
  const prisma = new PrismaClient();
  cleanSessions(prisma).then(({ count }) => console.log(`Removed ${count} expired/idle session(s).`))
    .catch(() => { console.error('Session cleanup failed; no secrets logged.'); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
module.exports = { cleanSessions };
