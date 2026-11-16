// Trusted operator only: promote an existing active account when no active admin exists.
require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { createPrisma, databaseProvider } = require('../src/database');
const { normalizeEmail, validateEmail } = require('../src/auth/credentials');
const { lockIdentity } = require('../src/auth/admin');
async function bootstrapAdmin(prisma, provider, input) {
  const email = normalizeEmail(input || '');
  if (!validateEmail(email)) throw new Error('Supply an existing active account email.');
  return prisma.$transaction(async tx => {
    await lockIdentity(tx, provider);
    if (await tx.user.count({ where: { role: 'admin', status: 'active' } })) throw new Error('An active admin already exists; use the admin API instead.');
    const user = await tx.user.findUnique({ where: { email }, select: { id: true, status: true } });
    if (!user || user.status !== 'active') throw new Error('The account must exist and be active.');
    await tx.user.update({ where: { id: user.id }, data: { role: 'admin', chefId: null } });
    return user.id;
  });
}
if (require.main === module) {
  const prisma = createPrisma();
  bootstrapAdmin(prisma, databaseProvider(process.env.DATABASE_URL), process.argv[2])
    .then(id => console.log(`Admin bootstrapped for user ${id}.`))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
module.exports = { bootstrapAdmin };
