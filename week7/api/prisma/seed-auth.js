require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { createPrisma } = require('../src/database');
const { normalizeEmail, validateEmail, hashPassword } = require('../src/auth/credentials');

async function seedAuth(prisma, env = process.env) {
  const original = env.AUTH_SEED_EMAIL?.trim() || '';
  const email = normalizeEmail(original);
  const password = env.AUTH_SEED_PASSWORD;
  if (!validateEmail(email) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('Set AUTH_SEED_EMAIL and AUTH_SEED_PASSWORD (8-128 characters) locally.');
  }
  // Never replace credentials or activate an existing pending account.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { created: false };
  await prisma.user.create({ data: {
    emailOriginal: original, email, passwordHash: await hashPassword(password),
    role: 'viewer', status: 'active', emailVerifiedAt: new Date()
  } });
  return { created: true };
}

if (require.main === module) {
  const prisma = createPrisma();
  seedAuth(prisma).then(({ created }) => console.log(created ? 'Active demo account created.' : 'Account already exists; nothing changed.'))
    .catch(() => { console.error('Auth seed failed. Check configuration/schema; no secrets logged.'); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
module.exports = { seedAuth };
