import { PrismaClient } from '@prisma/client';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { validatePhotoMetadata, validatePublication } from '../services/contracts.js';

const decodeJob = row => row && ({ id: row.id, photoId: row.photoId, kind: row.kind, keys: JSON.parse(row.keysJson) });
const variants = { orderBy: { width: 'asc' } };

// Same tables and canonical .lock as Person 3's repository; one cleanup protocol.
export async function createRepository(filename) {
  if (!isAbsolute(filename) || filename === ':memory:') throw new TypeError('Persistent absolute database path required');
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${filename.replaceAll('\\', '/')}` } } });
  let lock;
  try {
    await prisma.$connect();
    await prisma.photo.count();
    await prisma.cleanupJob.count();
    await prisma.managerSession.count();
    await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    await prisma.$executeRawUnsafe('PRAGMA synchronous=FULL');
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000');
    lock = new DatabaseSync(`${realpathSync(filename)}.lock`);
    lock.exec('PRAGMA busy_timeout=5000');
  } catch (error) { lock?.close(); await prisma.$disconnect(); throw error; }

  return {
    async withLock(fn) {
      lock.exec('BEGIN IMMEDIATE');
      try { return await fn(); } finally { lock.exec('ROLLBACK'); }
    },
    async createUploadManifest(value) {
      await prisma.cleanupJob.create({ data: { id: value.id, photoId: value.photoId, kind: 'upload', keysJson: JSON.stringify(value.keys) } });
    },
    async publishPhoto(value) {
      const metadata = validatePhotoMetadata(value);
      validatePublication(value, value.variants);
      await prisma.$transaction(async tx => {
        const manifest = await tx.cleanupJob.findUnique({ where: { photoId_kind: { photoId: value.id, kind: 'upload' } } });
        const keys = manifest && JSON.parse(manifest.keysJson);
        if (!keys || keys.length !== value.variants.length || value.variants.some(v => !keys.includes(v.key))) throw new Error('Publication requires the complete durable upload manifest');
        await tx.photo.create({ data: {
          id: value.id, ...metadata, width: value.width, height: value.height, published: true,
          variants: { create: value.variants.map(v => ({ width: v.width, height: v.height, bytes: v.bytes, mime: v.mime, key: v.key })) },
        } });
      });
    },
    findPublishedPhoto(id) { return prisma.photo.findFirst({ where: { id, published: true }, include: { variants } }); },
    async listPublishedPhotos({ page, limit }) {
      const [total, items] = await prisma.$transaction([
        prisma.photo.count({ where: { published: true } }),
        prisma.photo.findMany({ where: { published: true }, include: { variants }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      ]);
      return { items, total, page, limit };
    },
    async removeUploadManifest(id) { await prisma.cleanupJob.deleteMany({ where: { id, kind: 'upload' } }); },
    beginDelete(photoId) {
      return prisma.$transaction(async tx => {
        const existing = await tx.cleanupJob.findUnique({ where: { photoId_kind: { photoId, kind: 'delete' } } });
        if (existing) return decodeJob(existing);
        const photo = await tx.photo.findFirst({ where: { id: photoId, published: true }, include: { variants } });
        if (!photo) return null;
        await tx.photo.update({ where: { id: photoId }, data: { published: false } });
        return decodeJob(await tx.cleanupJob.create({ data: { id: randomUUID(), photoId, kind: 'delete', keysJson: JSON.stringify(photo.variants.map(v => v.key)) } }));
      });
    },
    async listCleanupJobs() { return (await prisma.cleanupJob.findMany({ orderBy: { id: 'asc' } })).map(decodeJob); },
    async finishDelete(id) {
      await prisma.$transaction(async tx => {
        const job = await tx.cleanupJob.findFirst({ where: { id, kind: 'delete' } });
        if (!job) return;
        const photo = await tx.photo.findUnique({ where: { id: job.photoId } });
        if (photo?.published) throw new Error('Cannot finish deletion of a published photo');
        await tx.photo.deleteMany({ where: { id: job.photoId, published: false } });
        await tx.cleanupJob.delete({ where: { id } });
      });
    },
    async findPublishedVariant(photoId, width) {
      const row = await prisma.photoVariant.findFirst({ where: { photoId, width, photo: { published: true } } });
      return row ? { key: row.key, bytes: row.bytes, mime: row.mime } : null;
    },
    async createSession(tokenHash, expiresAt) {
      await prisma.$transaction([
        prisma.managerSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
        prisma.managerSession.create({ data: { tokenHash, expiresAt } }),
      ]);
    },
    findSession(tokenHash) { return prisma.managerSession.findFirst({ where: { tokenHash, expiresAt: { gt: new Date() } } }); },
    async deleteSession(tokenHash) { await prisma.managerSession.deleteMany({ where: { tokenHash } }); },
    async pruneSessions() { await prisma.managerSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }); },
    async close() { lock.close(); await prisma.$disconnect(); },
  };
}
