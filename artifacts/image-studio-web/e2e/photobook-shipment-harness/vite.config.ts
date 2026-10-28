import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../..');
const stub = path.join(here, 'stubs.tsx');
export default defineConfig({
  root: here, plugins: [react()],
  define: { __VITE_BASE_PATH__: JSON.stringify('/'), __APP_MODE__: JSON.stringify('test') },
  resolve: {
    alias: [
      { find: '@/lib/queryClient', replacement: path.join(here, 'queryClient.ts') },
      { find: './queryClient', replacement: path.join(here, 'queryClient.ts') },
      { find: './firebase', replacement: path.resolve(here, '../campaign-product-selection-harness/stubs/firebase.ts') },
      ...['@/lib/galleries', '@/lib/jobs', '@/lib/labs', '@/hooks/use-toast',
        '@/components/admin/JobPicker', '@/components/photobook/PhotobookTutorial',
        '@/components/photobook/MockupAdminFlow', '@/components/jobs/operativo/LabFileUploader',
        '@/components/jobs/operativo/LabSendFeedback'].map(find => ({ find, replacement: stub })),
      { find: '@', replacement: path.join(app, 'src') },
      { find: '@shared', replacement: path.resolve(app, '../../lib/shared-src') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: { host: '127.0.0.1', port: Number(process.env.PORT || 4197), strictPort: true, fs: { strict: false } },
});
