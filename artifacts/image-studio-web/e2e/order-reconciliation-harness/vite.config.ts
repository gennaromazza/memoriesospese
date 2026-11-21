import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../..');
const inert = [
  '@/lib/bookings', '@/lib/booking-campaigns', '@/lib/clienti', '@/lib/jobs',
  '@/lib/products', '@/lib/product-categories', '@/lib/galleries',
  '@/context/FirebaseAuthContext', '@/hooks/use-toast',
  './booking/useLiveBookings',
  './booking/BookingPaymentPanel',
  './booking/BookingManagementLinkPanel', './booking/BookingCancellationAdminPanel',
  './booking/BookingPaymentCheckouts',
  './booking/InPersonDepositDialog',
  '@/components/EditOrderModal', '@/components/ProductSelector',
  '@/components/NewGalleryModal', '@/components/ShareGalleryButton',
  '@/components/ManualBookingModal', '@/pages/GalleryManagementWorkspace',
];
const inertPaths = inert.map(id => id.startsWith('@/')
  ? path.join(app, 'src', id.slice(2))
  : path.join(app, 'src/components', id));
export default defineConfig({
  root: here,
  define: { __VITE_BASE_PATH__: JSON.stringify('/'), __APP_MODE__: JSON.stringify('test') },
  plugins: [
    { name: 'isolate-booking-boundaries', enforce: 'pre', resolveId(id) {
      if (inert.includes(id) || inertPaths.includes(id.replace(/\.(tsx?|jsx?)$/, ''))) {
        return path.join(here, 'boundaries.tsx');
      }
    } },
    react(),
  ],
  resolve: {
    alias: [
      { find: '@/lib/queryClient', replacement: path.join(here, 'query-client.ts') },
      { find: '@/lib/firebase', replacement: path.join(here, 'firestore.ts') },
      { find: './firebase', replacement: path.join(here, 'firestore.ts') },
      { find: 'firebase/firestore', replacement: path.join(here, 'firestore.ts') },
      { find: '@', replacement: path.join(app, 'src') },
      { find: '@shared', replacement: path.resolve(app, '../../lib/shared-src') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: { host: '127.0.0.1', port: Number(process.env.PORT || 4194), strictPort: true, fs: { strict: false } },
});
