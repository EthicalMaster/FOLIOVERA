/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Server Entry Point
 * Full-stack Express server compatible with both development (tsx + Vite middleware)
 * and production Cloud Run deployment (node server.ts + static dist serving).
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/api/router.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const distPath = path.resolve(__dirname, 'dist');
const distIndexHtml = path.resolve(distPath, 'index.html');

// Use production static serving when NODE_ENV=production, or when invoked via `node server.ts` / `npm start`
// with a built `dist/index.html` artifact present. Use Vite middleware during `npm run dev`.
const isDevLifecycle =
  process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
const useProductionStatic =
  process.env.NODE_ENV === 'production' || (!isDevLifecycle && fs.existsSync(distIndexHtml));

async function startServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '1mb' }));

  // Basic security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // API router mount
  app.use('/api', apiRouter);

  // Static Production vs Vite development middleware
  if (useProductionStatic && fs.existsSync(distIndexHtml)) {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(distIndexHtml);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Server Error]:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: errorMessage
      }
    });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[Foliovera] Server operational at http://0.0.0.0:${PORT} (mode: ${useProductionStatic ? 'production-static' : 'development-vite'})`
    );
  });

  const shutdown = () => {
    console.log('[Foliovera] Gracefully shutting down...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('[Startup Error]:', err);
  process.exit(1);
});
