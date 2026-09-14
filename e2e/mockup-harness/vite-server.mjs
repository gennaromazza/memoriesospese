import path from 'node:path';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

export function createMockupHarnessServer(projectRoot = process.cwd(), { define } = {}) {
  const root = path.resolve(projectRoot);
  const harnessRoot = path.join(root, 'e2e/mockup-harness');

  return createServer({
    configFile: false,
    root: harnessRoot,
    publicDir: path.join(root, 'client/public'),
    plugins: [
      {
        name: 'mockup-test-firebase',
        enforce: 'pre',
        resolveId(source, importer) {
          if (
            source === '@/lib/firebase' ||
            source.replaceAll('\\', '/').endsWith('/client/src/lib/firebase') ||
            (source === './firebase' && importer?.replaceAll('\\', '/').includes('/client/src/lib/'))
          ) {
            return path.join(harnessRoot, 'firebase.ts');
          }
        },
      },
      react(),
    ],
    resolve: { alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') } },
    ...(define ? { define } : {}),
    css: { postcss: path.join(root, 'postcss.config.js') },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
  });
}