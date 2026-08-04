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
import placesRoutes from './places-routes.js';
import collaboratoriRoutes from './collaboratori-routes.js';
import labRoutes, { runLabShipmentExpiryCheck } from './lab-routes.js';
import productsRoutes from './products-routes.js';
import migrationRoutes from './migration-routes.js';
import adminRoutes from './admin-routes.js';
import galleryRoutes from './gallery-routes.js';
import bulkEmailRoutes, { cleanupStaleJobs, startBulkEmailDispatcher, stopBulkEmailDispatcher } from './bulk-email-routes.js';
import reminderRoutes, { runReminderCheck, runVisioneAutoInviteCheck } from './reminder-routes.js';
import backupRoutes from './backup-routes.js';
import auditRoutes from './audit-routes.js';
import gdprRoutes from './gdpr-routes.js';
import studioAssistantRoutes from './studio-assistant-routes.js';
import infoFormRoutes from './info-form-routes.js';
import photobookRoutes from './photobook-routes.js';
import { generateDynamicSitemap } from "./sitemap-generator";
import { createSeoMiddleware } from './seo-prerender';
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
    const defaultJson = express.json();
    app.use(defaultJson);
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

    app.use('/api/places', placesRoutes);
    console.log('📍 Places API routes mounted at /api/places');

    console.log('🧾 Receipt API routes mounted at /api/receipts');

    // Registra routes collaboratori
    app.use('/api', collaboratoriRoutes);
    console.log('👥 Collaboratori API routes mounted at /api');

    // Registra routes laboratori (labs + lab-shipments)
    app.use('/api', labRoutes);
    console.log('🖨️  Lab API routes mounted at /api');

    // Products routes
    app.use('/api/products', productsRoutes);
    console.log('📦 Products API routes mounted at /api/products');

    // Migration routes
    app.use('/api/migrations', migrationRoutes);
    console.log('🔄 Migration API routes mounted at /api/migrations');

    // Admin routes
    app.use('/api/admin', adminRoutes);
    console.log('🔐 Admin API routes mounted at /api/admin');

    // Gallery routes (gallery-scoped, non-admin: es. ospiti che innescano le miniature)
    app.use('/api/galleries', galleryRoutes);
    console.log('🖼️  Gallery API routes mounted at /api/galleries');

    // Bulk Email routes
    app.use('/api/bulk-email', bulkEmailRoutes);
    console.log('📮 Bulk Email API routes mounted at /api/bulk-email');

    // Reminder routes
    app.use('/api/reminders', reminderRoutes);
    console.log('⏰ Reminder API routes mounted at /api/reminders');

    // Backup routes
    app.use('/api/backup', backupRoutes);
    console.log('💾 Backup API routes mounted at /api/backup');

    // Audit routes
    app.use('/api/audit', auditRoutes);
    console.log('✓ Audit routes');

    app.use('/api/gdpr', gdprRoutes);
    console.log('🔍 Audit API routes mounted at /api/audit');

    // Studio Assistant routes
    app.use('/api/studio-assistant', studioAssistantRoutes);
    console.log('✨ Studio Assistant API routes mounted at /api/studio-assistant');

    // Info Forms (moduli informativi) — accesso pubblico via token UUID
    app.use('/api/info-forms', infoFormRoutes);
    console.log('📝 Info Form API routes mounted at /api/info-forms');

    // Fotolibri (revisione cliente) — route admin + pubbliche a token
    app.use('/api/photobooks', photobookRoutes);
    console.log('📖 Photobook API routes mounted at /api/photobooks');

    // Sitemap dinamica
    app.get('/sitemap.xml', async (req, res) => {
      try {
        const sitemap = await generateDynamicSitemap();
        res.header('Content-Type', 'application/xml; charset=utf-8');
        res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
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

    // SEO prerender middleware per bot e crawler (Google, ChatGPT, etc.)
    app.use(createSeoMiddleware());
    console.log('🔍 SEO prerender middleware attivo per crawler e AI');

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
    let reminderSchedulerInterval: NodeJS.Timeout | null = null;

    // Start server
    app.listen(PORT, '0.0.0.0', async () => {
      console.log(`🚀 Ready in ${Date.now() - start}ms`);
      console.log(`🌐 Server: http://0.0.0.0:${PORT}`);
      console.log(`📧 Email API: http://0.0.0.0:${PORT}/api/email/notify-new-photos`);
      console.log('✅ Development server ready!');
      
      // Start automated retry worker per cancellation_pending bookings
      cancellationWorkerCleanup = startCancellationRetryWorker();
      
      // Start Event Sync Guard worker (every 10 minutes)
      startEventSyncWorker(30);
      
      // BOOT-TIME CLEANUP: Rilascia quota da stale jobs (crash recovery)
      await cleanupStaleJobs();
      console.log('🧹 Boot-time cleanup completato');
      
      // BULK EMAIL DISPATCHER: Pull and execute queued jobs (every 30s)
      startBulkEmailDispatcher(30000);
      
      // RECURRING CLEANUP: Heartbeat-aware cleanup (every 10 minutes)
      bulkEmailCleanupInterval = setInterval(async () => {
        console.log('🧹 Recurring cleanup check...');
        await cleanupStaleJobs();
      }, 10 * 60 * 1000);
      console.log('⏰ Recurring cleanup worker started (10 min interval)');

      // REMINDER SCHEDULER: Controlla e invia reminder 24h prima ogni ora
      // Prima esecuzione dopo 2 minuti dal boot (evita cold-start)
      const runRemindersWithLog = async () => {
        try {
          const r = await runReminderCheck();
          if (r.bookings.sent + r.consultations.sent + r.galleries.sent > 0) {
            console.log(`⏰ Reminder scheduler: ${r.bookings.sent} booking, ${r.consultations.sent} consulenze, ${r.galleries.sent} gallerie inviate`);
          }
        } catch (err: any) {
          console.error('⏰ Reminder scheduler errore:', err.message);
        }
        // Auto-invito consulenza visione (idempotente: marker atomico per job)
        try {
          const v = await runVisioneAutoInviteCheck();
          if (v.sent > 0) {
            console.log(`⏰ Auto-invito visione: ${v.sent} invii inviati (${v.errors.length} errori)`);
          }
        } catch (err: any) {
          console.error('⏰ Auto-invito visione errore:', err.message);
        }
        // Auto-eliminazione file spedizioni laboratorio scadute
        try {
          const lab = await runLabShipmentExpiryCheck();
          if (lab.expired > 0) {
            console.log(`⏰ Consegne laboratorio: ${lab.expired} spedizioni scadute eliminate da Drive`);
          }
        } catch (err: any) {
          console.error('⏰ Lab shipment expiry errore:', err.message);
        }
      };
      setTimeout(runRemindersWithLog, 2 * 60 * 1000);
      reminderSchedulerInterval = setInterval(runRemindersWithLog, 60 * 60 * 1000);
      console.log('⏰ Reminder scheduler attivo (controllo ogni ora, prima esecuzione tra 2 min)');
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
      if (reminderSchedulerInterval) {
        clearInterval(reminderSchedulerInterval);
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