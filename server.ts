/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Server Entry Point (Phase 1.5)
 * Full-stack Express server compatible with both development (tsx + Vite middleware)
 * and production Cloud Run deployment (node server.ts + static dist serving).
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './server/api/router.ts';
import { redactSecrets } from './server/security/api-protection.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const distPath = path.resolve(__dirname, 'dist');
const distIndexHtml = path.resolve(distPath, 'index.html');

const isDevLifecycle =
  process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
const useProductionStatic =
  process.env.NODE_ENV === 'production' || (!isDevLifecycle && fs.existsSync(distIndexHtml));

async function startServer() {
  const app = express();

  // Enforce strict payload limit
  app.use(express.json({ limit: '512kb' }));

  // Hardened security & CORS headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

    const allowedOrigin = process.env.APP_URL;
    const reqOrigin = req.headers.origin;
    if (reqOrigin && allowedOrigin && reqOrigin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
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

  // Global error handler with automatic secret redaction
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const rawMessage = err instanceof Error ? err.message : 'Internal Server Error';
    const safeMessage = redactSecrets(rawMessage);
    console.error('[Server Error]:', safeMessage);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: safeMessage
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
  console.error('[Startup Error]:', redactSecrets(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
