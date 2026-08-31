import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import path from 'node:path';

const IMMUTABLE_ASSET_CACHE = 'public, max-age=31536000, immutable';
const REVALIDATE_CACHE = 'no-cache, max-age=0, must-revalidate';
const SPA_DOCUMENT_CACHE = 'no-cache, no-store, must-revalidate';

export function runtimeServerLabel(nodeEnv = process.env.NODE_ENV): 'production' | 'development' {
  return nodeEnv === 'production' ? 'production' : 'development';
}
export function productionClientBuildPath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'dist', 'app');
}

export function apiNotFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: `Endpoint API non trovato: ${req.method} ${req.originalUrl}`,
    },
  });
}

function isImmutableAsset(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join('/');
  return normalized.includes('/assets/');
}

function setStaticCacheHeaders(res: Response, filePath: string): void {
  res.setHeader(
    'Cache-Control',
    isImmutableAsset(filePath) ? IMMUTABLE_ASSET_CACHE : REVALIDATE_CACHE,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function setSpaDocumentHeaders(res: Response): void {
  res.setHeader('Cache-Control', SPA_DOCUMENT_CACHE);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/**
 * Monta esclusivamente la build Vite gia generata. Le API devono essere
 * registrate prima di questa funzione; la relativa 404 va montata subito
 * prima, cosi un endpoint errato non puo mai ricevere index.html con status 200.
 */
export function mountProductionClient(
  app: Express,
  options: { cwd?: string } = {},
): string {
  const buildPath = productionClientBuildPath(options.cwd);

  app.use(express.static(buildPath, {
    fallthrough: true,
    index: false,
    setHeaders: setStaticCacheHeaders,
  }));

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Un asset inesistente deve restare un vero 404: restituire la SPA con
    // Content-Type HTML maschererebbe errori di deploy e romperebbe le cache.
    if (path.extname(req.path)) {
      res.status(404).type('text/plain').send('Not Found');
      return;
    }

    setSpaDocumentHeaders(res);
    res.sendFile(path.join(buildPath, 'index.html'), error => {
      if (error && !res.headersSent) next(error);
    });
  });

  return buildPath;
}
