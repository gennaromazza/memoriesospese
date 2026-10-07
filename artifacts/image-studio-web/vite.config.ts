import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import { readFile, writeFile } from 'node:fs/promises';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { renderPrintSocialPageHtml } from './build/print-social-page';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

function printSocialPagePlugin(): Plugin {
  return {
    name: 'print-service-social-page',
    apply: 'build',
    async closeBundle() {
      const publicDir = path.resolve(import.meta.dirname, 'dist/public');
      const indexHtml = await readFile(path.join(publicDir, 'index.html'), 'utf8');
      const printHtml = renderPrintSocialPageHtml(indexHtml);
      await writeFile(path.join(publicDir, 'stampa-foto-aversa.html'), printHtml, 'utf8');
    },
  };
}

export default defineConfig({
  base: basePath,
  define: {
    __VITE_BASE_PATH__: JSON.stringify(basePath),
    __APP_MODE__: JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  plugins: [
    react(),
    printSocialPagePlugin(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
      '@shared': path.resolve(import.meta.dirname, '..', '..', 'lib', 'shared-src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    ...(process.env.VITE_API_PROXY_TARGET
      ? {
          proxy: {
            '/api': {
              target: process.env.VITE_API_PROXY_TARGET,
              changeOrigin: true,
            },
          },
        }
      : {}),
    fs: {
      strict: false,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
