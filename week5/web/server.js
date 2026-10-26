import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
// Read only the two public server settings. No API secrets enter the browser.
try {
  const env = await fs.readFile(path.join(root, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^(WEB_PORT|API_BASE_URL)\s*=\s*["']?([^"'\r\n]+?)["']?\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain' };

export function createWebServer({ apiBaseUrl = 'http://localhost:3001/api' } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const send = (status, type, content) => {
      res.writeHead(status, { 'Content-Type': type.startsWith('text/') ? `${type}; charset=utf-8` : type });
      res.end(req.method === 'HEAD' ? undefined : content);
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/config.js') return send(200, 'text/javascript', `export const API_BASE_URL = ${JSON.stringify(apiBaseUrl)};`);
      const publicRoute = !path.extname(pathname) && !pathname.split('/').some((part) => part.startsWith('.')) && !pathname.startsWith('/api/') && !pathname.startsWith('/src/');
      const file = publicRoute ? path.join(root, 'index.html') :
        pathname.startsWith('/src/') ? path.resolve(root, `.${pathname}`) : path.resolve(root, 'public', `.${pathname}`);
      const allowedRoot = pathname.startsWith('/src/') ? path.join(root, 'src') : path.join(root, 'public');
      if (!publicRoute && !file.startsWith(`${allowedRoot}${path.sep}`)) return send(404, 'text/plain', 'Not found');
      const content = await fs.readFile(file);
      // Versionless images/fonts can be revalidated daily. HTML, source and
      // config.js keep no-store so edits and API settings remain immediately visible.
      if (!publicRoute && /\.(?:svg|jpeg|jpg|png|webp|ttf|woff2)$/.test(file)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
      return send(200, types[path.extname(file)] || 'application/octet-stream', content);
    } catch (error) {
      return send(error instanceof URIError ? 400 : error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500, 'text/plain', 'Không thể tải tài nguyên.');
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createWebServer({ apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3001/api' });
  server.listen(Number(process.env.WEB_PORT || 5173), () => console.log('Soucha SPA ready at http://localhost:' + server.address().port));
}
