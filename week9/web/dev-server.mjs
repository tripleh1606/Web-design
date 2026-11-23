import http from 'node:http';
import https from 'node:https';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = await realpath(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 5090);
const target = new URL(process.env.API_ORIGIN || 'http://127.0.0.1:5091');
if (!['http:', 'https:'].includes(target.protocol) || target.pathname !== '/' || target.search || target.hash || target.username || target.password) throw new Error('API_ORIGIN phải là HTTP(S) origin không chứa path hoặc credential.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
const failure = (res, status, message) => {
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: { code: 'FRONTEND_SERVER', message } }));
};
http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { failure(res, 400, 'URL không hợp lệ.'); return; }
  if (pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/media/')) {
    // Preserve the browser Origin: backend must explicitly trust the development web origin.
    const upstreamURL = new URL(target);
    const requested = new URL(req.url, 'http://localhost');
    upstreamURL.pathname = requested.pathname;
    upstreamURL.search = requested.search;
    const proxy = (target.protocol === 'https:' ? https : http).request(upstreamURL, {
      method: req.method, headers: { ...req.headers, host: target.host },
    }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.on('error', () => res.destroy());
      upstream.pipe(res);
    });
    proxy.setTimeout(120000, () => proxy.destroy(new Error('Upstream timeout')));
    proxy.on('error', () => failure(res, 502, 'Chưa kết nối được backend Gallery. Khởi chạy API và cấu hình API_ORIGIN cho web server.'));
    req.on('aborted', () => proxy.destroy());
    res.on('close', () => { if (!res.writableEnded) proxy.destroy(); });
    req.pipe(proxy);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { failure(res, 405, 'Method không được hỗ trợ.'); return; }
  const documentRoute = pathname === '/' || pathname === '/manage' || /^\/photos\/[^/]+$/.test(pathname);
  if (!documentRoute && !pathname.startsWith('/src/') && !pathname.startsWith('/public/')) { failure(res, 404, 'Không tìm thấy tài nguyên.'); return; }
  try {
    const candidate = path.resolve(root, documentRoute ? 'index.html' : `.${pathname}`);
    const file = await realpath(candidate);
    if (!file.startsWith(root + path.sep)) { failure(res, 403, 'Không được truy cập.'); return; }
    const info = await stat(file);
    if (!info.isFile()) { failure(res, 404, 'Không tìm thấy file.'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { failure(res, 404, 'Không tìm thấy file.'); }
}).listen(port, '127.0.0.1', () => console.log(`POSTAGE web ready http://127.0.0.1:${port} (API ${target.origin})`));
