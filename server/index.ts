/**
 * Development Server with Email API Routes + Vite
 * Combina Express.js API routes con Vite dev server per sviluppo
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import emailRoutes from './email-routes.js';

async function startServer() {
  const start = Date.now();
  
  try {
    console.log('⚡ Starting development server...');
    
    const app = express();
    const PORT = parseInt(process.env.PORT || '5000', 10);

    // Middleware per parsing JSON
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

    // API Routes (PRIMA di Vite middleware)
    app.use('/api/email', emailRoutes);
    console.log('📧 Email API routes mounted at /api/email');

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', server: 'dev', timestamp: new Date().toISOString() });
    });

    // Vite dev server middleware
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        port: PORT,
        host: '0.0.0.0',
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
