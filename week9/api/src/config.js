import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';

export const weekRoot = fileURLToPath(new URL('../../', import.meta.url));
export const prismaRoot = fileURLToPath(new URL('../prisma/', import.meta.url));
export function loadEnvironment() { dotenv.config({ path: resolve(weekRoot, '.env'), quiet: true }); }

export function databasePath(url) {
  if (typeof url !== 'string' || !url.startsWith('file:') || /[?#]/.test(url)) throw new Error('DATABASE_URL must be a SQLite file: URL without query or fragment');
  const name = url.slice(5);
  if (!name || name === ':memory:') throw new Error('DATABASE_URL must be persistent');
  return isAbsolute(name) ? name : resolve(prismaRoot, name);
}

function integer(env, key, fallback, min, max) {
  const text = env[key] ?? String(fallback);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < min || Number(text) > max) throw new Error(`Invalid ${key}`);
  return Number(text);
}
function boolean(env, key, fallback) {
  const value = env[key] ?? String(fallback);
  if (!['true', 'false'].includes(value)) throw new Error(`Invalid ${key}`);
  return value === 'true';
}

export function readConfig(env = process.env) {
  const origin = new URL(env.PUBLIC_ORIGIN || 'http://127.0.0.1:5091');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin');
  const secureCookie = boolean(env, 'COOKIE_SECURE', origin.protocol === 'https:');
  if (origin.protocol === 'https:' && !secureCookie) throw new Error('HTTPS requires COOKIE_SECURE=true');
  if (!/^[A-Za-z0-9_-]{43,256}$/.test(env.MANAGE_CAPABILITY || '')) throw new Error('MANAGE_CAPABILITY must be a random base64url secret of at least 43 characters');
  const endpoint = new URL(env.S3_ENDPOINT);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid S3_ENDPOINT');
  for (const key of ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) if (!env[key]?.trim()) throw new Error(`Missing ${key}`);
  const filename = databasePath(env.DATABASE_URL || 'file:../../data/gallery.sqlite');
  return {
    filename, host: env.HOST || '127.0.0.1', port: integer(env, 'PORT', 5091, 1, 65535),
    publicOrigin: origin.origin, secureCookie, capability: env.MANAGE_CAPABILITY,
    sessionTtlSeconds: integer(env, 'SESSION_TTL_SECONDS', 28800, 60, 604800),
    cleanupIntervalSeconds: integer(env, 'CLEANUP_INTERVAL_SECONDS', 60, 5, 3600),
    s3: { endpoint: endpoint.href, region: env.S3_REGION, bucket: env.S3_BUCKET,
      forcePathStyle: boolean(env, 'S3_FORCE_PATH_STYLE', true),
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } },
  };
}
