/**
 * Development Server with API Routes + Vite
 * Combina Vite dev server con route API Express.js per email
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import emailRoutes from './email-routes.js';

async function startDevServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '5000', 10);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS per sviluppo
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // API Routes (servite PRIMA di Vite middleware)
  app.use('/api/email', emailRoutes);

  console.log('📧 Email API routes mounted at /api/email');

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'dev', timestamp: new Date().toISOString() });
  });

  // Vite dev server middleware (per frontend)
  try {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);
    console.log('⚡ Vite dev server middleware attached');
  } catch (error) {
    console.error('❌ Failed to start Vite server:', error);
    process.exit(1);
  }

  // Start server
  app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Development Server Started');
    console.log(`📱 Server: http://0.0.0.0:${PORT}`);
    console.log(`📧 Email API: http://0.0.0.0:${PORT}/api/email/notify-new-photos`);
    console.log('✅ Ready!');
  });
}

startDevServer().catch((err) => {
  console.error('❌ Server startup failed:', err);
  process.exit(1);
});
