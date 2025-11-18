/**
 * Development Server with Email API Routes + Vite
 * Combina Express.js API routes con Vite dev server per sviluppo
 */

import express from 'express';
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

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Ready in ${Date.now() - start}ms`);
      console.log(`🌐 Server: http://0.0.0.0:${PORT}`);
      console.log(`📧 Email API: http://0.0.0.0:${PORT}/api/email/notify-new-photos`);
      console.log('✅ Development server ready!');
    });

  } catch (error) {
    console.error('❌ Startup error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

startServer();