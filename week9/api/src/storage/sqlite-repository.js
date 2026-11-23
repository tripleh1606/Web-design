import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';

// Requires Node >= 22.13 and a reliable durable local filesystem. All
// processes must be on the same host and use the same canonical database and
// lock files. SQLite releases the lock on process death; it is never leased or
// stolen. Lock contention fails after five seconds rather than bypassing it.
// The lock database serializes access; its transaction is NOT atomic with the
// data DB. Data transactions independently commit before external side effects.
// Never modify these tables or objects outside the lifecycle protocol.
export function createSqliteRepository(filename) {
  if (!isAbsolute(filename) || filename === ':memory:') throw new TypeError('An absolute persistent SQLite path is required');
  const db = new DatabaseSync(filename);
  const lock = new DatabaseSync(`${realpathSync(filename)}.lock`);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  lock.exec('PRAGMA busy_timeout=5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, alt TEXT NOT NULL,
      width INTEGER NOT NULL, height INTEGER NOT NULL,
      published INTEGER NOT NULL CHECK(published IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS photo_variants (
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL,
      mime TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE,
      PRIMARY KEY(photo_id,width)
    );
    CREATE TABLE IF NOT EXISTS cleanup_jobs (
      id TEXT PRIMARY KEY, photo_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('upload','delete')),
      keys_json TEXT NOT NULL, UNIQUE(photo_id,kind)
    );
  `);
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  };
  const job = row => row && ({ id: row.id, photoId: row.photo_id, kind: row.kind, keys: JSON.parse(row.keys_json) });
  return {
    async withLock(fn) {
      // A separate SQLite database holds the advisory lock, allowing the real
      // data DB to commit manifests and publication independently while held.
      lock.exec('BEGIN IMMEDIATE');
      try { return await fn(); } finally { lock.exec('ROLLBACK'); }
    },
    createUploadManifest(value) {
      db.prepare('INSERT INTO cleanup_jobs VALUES (?, ?, ?, ?)').run(value.id, value.photoId, 'upload', JSON.stringify(value.keys));
    },
    publishPhoto(value) {
      transaction(() => {
        db.prepare('INSERT INTO photos(id,title,alt,width,height,published) VALUES (?,?,?,?,?,1)').run(value.id, value.title, value.alt, value.width, value.height);
        const insert = db.prepare('INSERT INTO photo_variants VALUES (?,?,?,?,?,?)');
        for (const v of value.variants) insert.run(value.id, v.width, v.height, v.bytes, v.mime, v.key);
      });
    },
    findPublishedPhoto(id) { return db.prepare('SELECT id FROM photos WHERE id=? AND published=1').get(id); },
    removeUploadManifest(id) { db.prepare("DELETE FROM cleanup_jobs WHERE id=? AND kind='upload'").run(id); },
    beginDelete(photoId) {
      return transaction(() => {
        const existing = db.prepare("SELECT * FROM cleanup_jobs WHERE photo_id=? AND kind='delete'").get(photoId);
        if (existing) return job(existing);
        const photo = db.prepare('SELECT id FROM photos WHERE id=? AND published=1').get(photoId);
        if (!photo) return null;
        const keys = db.prepare('SELECT storage_key FROM photo_variants WHERE photo_id=? ORDER BY width').all(photoId).map(row => row.storage_key);
        const value = { id: randomUUID(), photoId, kind: 'delete', keys };
        db.prepare('UPDATE photos SET published=0 WHERE id=?').run(photoId);
        db.prepare('INSERT INTO cleanup_jobs VALUES (?,?,?,?)').run(value.id, photoId, value.kind, JSON.stringify(keys));
        return value;
      });
    },
    listCleanupJobs() { return db.prepare('SELECT * FROM cleanup_jobs ORDER BY rowid').all().map(job); },
    finishDelete(id) {
      transaction(() => {
        const value = db.prepare("SELECT * FROM cleanup_jobs WHERE id=? AND kind='delete'").get(id);
        if (!value) return;
        if (db.prepare('SELECT id FROM photos WHERE id=? AND published=1').get(value.photo_id)) throw new Error('Cannot finish deletion of a published photo');
        db.prepare('DELETE FROM photos WHERE id=? AND published=0').run(value.photo_id);
        db.prepare('DELETE FROM cleanup_jobs WHERE id=?').run(id);
      });
    },
    findPublishedVariant(id, width) {
      const row = db.prepare('SELECT v.storage_key AS key, v.bytes, v.mime FROM photo_variants v JOIN photos p ON p.id=v.photo_id WHERE p.id=? AND p.published=1 AND v.width=?').get(id, width);
      return row || null;
    },
    close() { db.close(); lock.close(); },
  };
}
