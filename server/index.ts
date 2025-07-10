/**
 * Firebase-Only SPA Server
 * Serve solo file statici con Vite - Nessun Express
 */

import { createServer } from 'vite'

async function startServer() {
  try {
    console.log('🔥 Starting Firebase-Only SPA...');
    
    // Crea server Vite in modalità development
    const server = await createServer({
      server: {
        port: 5000,
        host: '0.0.0.0',
        open: false
      },
      root: './client',
      base: process.env.VITE_BASE_PATH || '/'
    });

    await server.listen();
    
    console.log('✅ Firebase-Only SPA started successfully!');
    console.log('🌐 Porta: 5000 (forwarded to 80/443)');
    console.log('🏠 Host: 0.0.0.0 (external access enabled)');
    console.log('🔥 Architettura: Firebase-Only (No Express)');
    console.log('📱 Modalità: SPA Development');
    
  } catch (error) {
    console.error('❌ Errore avvio server:', error);
    process.exit(1);
  }
}

startServer();