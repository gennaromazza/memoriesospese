/**
 * Development Server with Email API Routes + Vite
 * Combina Express.js API routes con Vite dev server per sviluppo
 */

import express, { type Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from 'vite';
import emailRoutes from './email-routes.js';
import bookingRoutes from './booking-routes.js';
import orderRoutes from './order-routes.js';
import jobRoutes from './job-routes.js';
import paymentScheduleRoutes from './payment-schedule-routes.js';
import quoteRoutes from './quote-routes.js';
import importRoutes from './import-routes.js';
import consultationRoutes from './consultation-routes.js';
import calendarRoutes from './calendar-routes.js';
import receiptRoutes from './receipt-routes.js';
import collaboratoriRoutes from './collaboratori-routes.js';
import productsRoutes from './products-routes.js';
import migrationRoutes from './migration-routes.js';
import adminRoutes from './admin-routes.js';
import bulkEmailRoutes, { cleanupStaleJobs, startBulkEmailDispatcher, stopBulkEmailDispatcher } from './bulk-email-routes.js';
import { generateDynamicSitemap } from "./sitemap-generator";
import { startCancellationRetryWorker } from './workers/cancellation-retry.js';
import { startEventSyncWorker, stopEventSyncWorker } from './sync/event-sync-guard.js';


async function startServer() {
  const start = Date.now();

  try {
    console.log('⚡ Starting development server...');

    const app = express();
    const PORT = parseInt(process.env.PORT || '5000', 10);

    // IMPORTANTE: Trust proxy per far funzionare req.secure dietro Replit proxy
    app.set('trust proxy', true);

    // Middleware per parsing JSON
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // CORS ristretto ai domini autorizzati
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5000',
      'https://gennaromazzacane.it',
      'https://www.gennaromazzacane.it'
    ];

    app.use((req, res, next) => {
      const origin = req.headers.origin || '';

      // Controlla se origin è autorizzato (inclusi domini Replit)
      const isAllowed = allowedOrigins.includes(origin) ||
                       origin.includes('.replit.dev') ||
                       origin.includes('.replit.app');

      if (isAllowed) {
        res.header('Access-Control-Allow-Origin', origin);
      }

      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Max-Age', '3600');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }
      next();
    });

    // API Routes (PRIMA di Vite middleware)
    app.use('/api/email', emailRoutes);
    console.log('📧 Email API routes mounted at /api/email');

    app.use('/api/booking', bookingRoutes);
    console.log('📅 Booking API routes mounted at /api/booking');

    app.use('/api/orders', orderRoutes);
    console.log('📦 Order API routes mounted at /api/orders');

    app.use('/api/jobs', jobRoutes);
    console.log('💼 Job API routes mounted at /api/jobs');

    app.use('/api/payment-schedules', paymentScheduleRoutes);
    console.log('💳 Payment Schedule API routes mounted at /api/payment-schedules');

    app.use('/api/quotes', quoteRoutes);
    console.log('📄 Quote API routes mounted at /api/quotes');

    app.use('/api/import', importRoutes);
    console.log('📥 Import API routes mounted at /api/import');

    app.use('/api/consultations', consultationRoutes);
    console.log('🗓️  Consultation API routes mounted at /api/consultations');

    app.use('/api/calendar', calendarRoutes);
    console.log('📆 Calendar API routes mounted at /api/calendar');

    app.use('/api/receipts', receiptRoutes);
    console.log('🧾 Receipt API routes mounted at /api/receipts');

    // Registra routes collaboratori
    app.use('/api', collaboratoriRoutes);
    console.log('👥 Collaboratori API routes mounted at /api');

    // Products routes
    app.use('/api/products', productsRoutes);
    console.log('📦 Products API routes mounted at /api/products');

    // Migration routes
    app.use('/api/migrations', migrationRoutes);
    console.log('🔄 Migration API routes mounted at /api/migrations');

    // Admin routes
    app.use('/api/admin', adminRoutes);
    console.log('🔐 Admin API routes mounted at /api/admin');

    // Bulk Email routes
    app.use('/api/bulk-email', bulkEmailRoutes);
    console.log('📮 Bulk Email API routes mounted at /api/bulk-email');

    // Sitemap dinamica
    app.get('/sitemap.xml', async (req, res) => {
      try {
        const sitemap = await generateDynamicSitemap();
        res.header('Content-Type', 'application/xml');
        res.send(sitemap);
      } catch (error) {
        console.error('Errore generazione sitemap:', error);
        res.status(500).send('Errore generazione sitemap');
      }
    });

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', server: 'dev', timestamp: new Date().toISOString() });
    });

    // Vite dev server middleware
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
    console.log('⚡ Vite middleware attached');

    // Capture worker cleanup for graceful shutdown
    let cancellationWorkerCleanup: (() => void) | null = null;
    let bulkEmailCleanupInterval: NodeJS.Timeout | null = null;

    // Start server
    app.listen(PORT, '0.0.0.0', async () => {
      console.log(`🚀 Ready in ${Date.now() - start}ms`);
      console.log(`🌐 Server: http://0.0.0.0:${PORT}`);
      console.log(`📧 Email API: http://0.0.0.0:${PORT}/api/email/notify-new-photos`);
      console.log('✅ Development server ready!');
      
      // Start automated retry worker per cancellation_pending bookings
      cancellationWorkerCleanup = startCancellationRetryWorker();
      
      // Start Event Sync Guard worker (every 10 minutes)
      startEventSyncWorker(10);
      
      // BOOT-TIME CLEANUP: Rilascia quota da stale jobs (crash recovery)
      await cleanupStaleJobs();
      console.log('🧹 Boot-time cleanup completato');
      
      // BULK EMAIL DISPATCHER: Pull and execute queued jobs (every 5s)
      startBulkEmailDispatcher(5000);
      
      // RECURRING CLEANUP: Heartbeat-aware cleanup (every 2 minutes)
      bulkEmailCleanupInterval = setInterval(async () => {
        console.log('🧹 Recurring cleanup check...');
        await cleanupStaleJobs();
      }, 2 * 60 * 1000); // 2 minuti (più frequente per heartbeat timeout)
      console.log('⏰ Recurring cleanup worker started (2 min interval)');
    });

    // Graceful shutdown: cleanup workers on SIGTERM/SIGINT
    const shutdown = (signal: string) => {
      console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
      if (cancellationWorkerCleanup) {
        cancellationWorkerCleanup();
      }
      stopEventSyncWorker();
      stopBulkEmailDispatcher();
      if (bulkEmailCleanupInterval) {
        clearInterval(bulkEmailCleanupInterval);
      }
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Startup error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

startServer();