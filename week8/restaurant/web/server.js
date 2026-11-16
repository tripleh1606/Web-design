import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const webRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(webRoot, '..', 'public');
const axiosPath = path.join(path.dirname(require.resolve('axios/package.json')), 'dist', 'axios.min.js');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function resolveInside(root, rel) {
  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('\0')) return null;
  const full = path.resolve(root, decoded);
  const relative = path.relative(root, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

async function isFile(file) {
  if (!file) return false;
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

async function sendFile(res, file) {
  const body = await fs.readFile(file);
  send(res, 200, types[path.extname(file).toLowerCase()] || 'application/octet-stream', body);
}

export function createWebServer() {
  return http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET') {
        send(res, 405, 'text/plain; charset=utf-8', 'Method Not Allowed');
        return;
      }
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/vendor/axios.min.js') {
        await sendFile(res, axiosPath);
        return;
      }
      const rel = pathname.replace(/^\/+/, '');
      if (rel) {
        const local = resolveInside(webRoot, rel);
        if (await isFile(local)) {
          await sendFile(res, local);
          return;
        }
        const asset = resolveInside(publicRoot, rel);
        if (await isFile(asset)) {
          await sendFile(res, asset);
          return;
        }
      }
      if (path.extname(pathname)) {
        send(res, 404, 'text/plain; charset=utf-8', 'Not Found');
        return;
      }
      await sendFile(res, path.join(webRoot, 'index.html'));
    } catch (error) {
      if (!res.headersSent) send(res, 500, 'text/plain; charset=utf-8', 'Internal Server Error');
      else res.end();
      console.error('SPA server error:', error.message);
    }
  });
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  const port = Number(process.env.WEB_PORT) || 5173;
  createWebServer().listen(port, () => {
    console.log(`Restaurant SPA listening on http://localhost:${port}/dishes`);
  });
}
