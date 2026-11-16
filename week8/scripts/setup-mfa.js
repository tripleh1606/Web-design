const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const api = path.resolve(__dirname, '../api');
const envFile = path.join(api, '.env');
require('dotenv').config({ path: envFile });
const { createPrisma, databaseProvider } = require('../api/src/database');
const { createSecretVault } = require('../api/src/auth/mfa-crypto');

async function main() {
  if (databaseProvider(process.env.DATABASE_URL) !== 'postgresql') throw new Error('Use db:push for an isolated SQLite database.');
  const vault = createSecretVault(process.env.MFA_ENCRYPTION_KEY);
  const prisma = createPrisma();
  try {
    const sql = fs.readFileSync(path.join(api, 'sql/004-mfa.sql'), 'utf8').replace(/^\s*--.*$/gm, '');
    await prisma.$transaction(async tx => {
      for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    }, { timeout: 30000 });
    const credentials = await prisma.mfaCredential.findMany({ where: { OR: [{ secretCipher: { not: null } }, { pendingCipher: { not: null } }] },
      select: { userId: true, secretCipher: true, pendingCipher: true } });
    if (!vault) {
      if (credentials.length) throw new Error('Encrypted MFA credentials already exist. Restore the original MFA_ENCRYPTION_KEY; do not generate a replacement.');
      const envText = fs.readFileSync(envFile, 'utf8');
      const keyLine = 'MFA_ENCRYPTION_KEY=' + randomBytes(32).toString('base64url');
      // A blank placeholder is safe only after proving no encrypted credential exists.
      if (/^\s*MFA_ENCRYPTION_KEY\s*=/m.test(envText)) fs.writeFileSync(envFile, envText.replace(/^\s*MFA_ENCRYPTION_KEY\s*=.*$/m, keyLine));
      else fs.appendFileSync(envFile, '\n' + keyLine + '\n');
      console.log('Created MFA encryption key in api/.env (value hidden). Back up this key privately.');
    } else {
      try {
        for (const credential of credentials) {
          for (const cipher of [credential.secretCipher, credential.pendingCipher].filter(Boolean)) vault.decrypt(cipher, credential.userId);
        }
      } catch { throw new Error('MFA key does not match existing credentials. Restore the original key.'); }
    }
    console.log('Week 8 MFA tables ready; existing users and business data preserved.');
  } finally { await prisma.$disconnect(); }
}
main().catch(error => {
  console.error('MFA setup failed:', /Prisma/.test(error.name) ? error.name + ' ' + (error.code || '') : error.message);
  process.exitCode = 1;
});
