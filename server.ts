/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Server Entry Point
 * Full-stack Express server with Vite middleware integration in development.
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/api/router';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

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

  // Vite development middleware vs Static Production
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
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
    console.log(`[Foliovera] Server operational at http://0.0.0.0:${PORT} (env: ${isProd ? 'production' : 'development'})`);
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
