import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = import.meta.dirname;
const app = path.resolve(here, '../..');

// Separate entry/config: never adds a test bypass to the shipped application.
export default defineConfig({
  root: here,
  plugins: [
    {
      name: 'isolated-desktop-api',
      enforce: 'pre',
      resolveId(source, importer) {
        if (importer && source.startsWith('.') &&
            path.resolve(path.dirname(importer.split('?')[0]), source).replace(/\.ts$/, '') ===
            path.join(app, 'src/lib/api')) {
          return path.join(here, 'api-fixture.ts');
        }
      },
      transform(code, id) {
        if (id.split('?')[0] === path.join(app, 'src/index.css')) {
          return code.replace(/^@import url\([^\n]+\);\r?\n/m, '');
        }
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.join(app, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    fs: { allow: [path.resolve(app, '../..')] },
  },
  build: { target: 'esnext', outDir: path.join(here, 'dist'), emptyOutDir: true },
});