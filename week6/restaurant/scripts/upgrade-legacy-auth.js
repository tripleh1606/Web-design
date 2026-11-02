require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../generated/prisma');
const { hashToken } = require('../src/auth/credentials');

async function upgradeLegacyAuth(prisma) {
  return prisma.$transaction(async tx => {
    // Only legacy rows have the newly added empty original-email default.
    // Existing verified accounts keep their verification; pending stay pending.
    const users = await tx.user.findMany({ where: { emailOriginal: '' } });
    for (const user of users) {
      await tx.user.update({ where: { id: user.id }, data: {
        emailOriginal: user.email, role: 'viewer', status: user.emailVerifiedAt ? 'active' : 'pending'
      } });
    }
    // Preserve old failure counters instead of silently resetting their budget.
    const attempts = await tx.loginAttempt.findMany();
    let migrated = 0;
    for (const old of attempts) {
      if (/^[a-f0-9]{64}$/.test(old.emailKey)) continue;
      const emailKey = hashToken(old.emailKey);
      const existing = await tx.loginAttempt.findUnique({ where: { emailKey } });
      const lockedUntil = [old.lockedUntil, existing?.lockedUntil].filter(Boolean).sort((a, b) => b - a)[0] || null;
      const data = { failedCount: Math.max(old.failedCount, existing?.failedCount || 0),
        windowStartedAt: existing && existing.windowStartedAt < old.windowStartedAt ? existing.windowStartedAt : old.windowStartedAt, lockedUntil };
      await tx.loginAttempt.upsert({ where: { emailKey }, create: { emailKey, ...data }, update: data });
      await tx.loginAttempt.deleteMany({ where: { emailKey: old.emailKey } });
      migrated++;
    }
    return { users: users.length, counters: migrated };
  });
}
if (require.main === module) {
  const prisma = new PrismaClient();
  upgradeLegacyAuth(prisma).then(result => console.log(`Upgraded ${result.users} legacy account(s), ${result.counters} counter(s).`))
    .catch(() => { console.error('Legacy auth upgrade failed. Check schema and restore/review backup as needed; no secrets logged.'); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
module.exports = { upgradeLegacyAuth };
