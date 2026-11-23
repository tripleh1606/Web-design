import express from 'express';
import { resolve } from 'node:path';
import { weekRoot } from './config.js';
import { createManager } from './auth/manager.js';
import { createPhotosRouter } from './routes/photos.js';
import { createMediaHandler } from './media/stream.js';
import { ApiError, errorHandler } from './services/errors.js';

export function createApp({ repository, storage, lifecycle, config, uploadHandler }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const manager = createManager({ repository, config });
  app.get('/api/manage/session', manager.status);
  app.post('/api/manage/session', manager.requireOrigin, express.json({ limit: '2kb', strict: true }), manager.login);
  app.delete('/api/manage/session', manager.requireOrigin, manager.requireSession, manager.logout);
  app.use('/api/photos', createPhotosRouter({ repository, lifecycle, manager, uploadHandler }));
  app.get('/media/:id/:width.webp', createMediaHandler({ repository, storage }));
  app.use(['/api', '/media'], (req, res, next) => next(new ApiError(404, 'NOT_FOUND', 'Không tìm thấy endpoint.')));
  const webRoot = resolve(weekRoot, 'web');
  for (const dir of ['src', 'public']) app.use(`/${dir}`, express.static(resolve(webRoot, dir), { dotfiles: 'deny', index: false, etag: false, maxAge: 0 }));
  app.get(['/', '/manage', '/photos/:id'], (req, res) => res.sendFile(resolve(webRoot, 'index.html')));
  app.use((req, res, next) => next(new ApiError(404, 'NOT_FOUND', 'Không tìm thấy tài nguyên.')));
  app.use(errorHandler);
  return app;
}
