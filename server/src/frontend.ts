import { accessSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router, static as serveStatic } from 'express';
import { config } from './config.js';

export function frontendRouter(directory: string) {
  const root = resolve(directory);
  const index = resolve(root, 'index.html');
  accessSync(index);
  const router = Router();
  router.use((req, _res, next) => {
    // Custom-domain aliases and canonical short links must reach the redirect router.
    if (
      req.get('host')?.toLowerCase() !== config.defaultDomain ||
      !['GET', 'HEAD'].includes(req.method) ||
      req.path === '/r' ||
      req.path.startsWith('/r/')
    )
      return next('router');
    next();
  });
  router.use(serveStatic(root, { index: false, dotfiles: 'deny' }));
  router.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/assets/') || /\.[^/]+$/.test(req.path)) return next('router');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(index);
  });
  return router;
}
