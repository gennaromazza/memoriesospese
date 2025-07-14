/**
 * Firebase-Only SPA Server
 * Serve solo file statici con Vite - Nessun Express
 */

import { createServer } from 'vite'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Funzione per trovare e terminare processi su una porta
async function killProcessOnPort(port: number) {
  try {
    const { stdout } = await execAsync(`netstat -tlnp 2>/dev/null | grep :${port} || true`)
    if (stdout.trim()) {
      console.log(`🔄 Terminando processo sulla porta ${port}...`)
      await execAsync(`pkill -f "tsx server/index.ts" 2>/dev/null || true`)
      await execAsync(`pkill -f "npm run dev" 2>/dev/null || true`)
      // Aspetta un momento per la terminazione
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  } catch (error) {
    // Ignora errori di terminazione processi
  }
}

// Funzione per trovare una porta disponibile
async function findAvailablePort(startPort: number = 5000): Promise<number> {
  const net = await import('net')
  
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(startPort, () => {
      const port = (server.address() as any)?.port
      server.close(() => resolve(port))
    })
    server.on('error', async () => {
      if (startPort < 5010) {
        resolve(await findAvailablePort(startPort + 1))
      } else {
        reject(new Error('No available ports found'))
      }
    })
  })
}

async function startServer() {
  try {
    console.log('🔥 Starting Firebase-Only SPA...');
    
    // Prova a liberare la porta 5000
    await killProcessOnPort(5000)
    
    // Trova una porta disponibile
    const availablePort = await findAvailablePort(5000)
    
    // Crea server Vite in modalità development
    const server = await createServer({
      server: {
        port: availablePort,
        host: '0.0.0.0',
        open: false,
        strictPort: false, // Allow trying other ports
        allowedHosts: ['all', '.replit.dev']
      },
      root: path.resolve(process.cwd(), 'client'),
      base: process.env.VITE_BASE_PATH || '/',
      resolve: {
        alias: {
          "@": path.resolve(process.cwd(), "client", "src"),
          "@shared": path.resolve(process.cwd(), "shared"),
          "@assets": path.resolve(process.cwd(), "attached_assets"),
        },
      },
    });

    await server.listen();
    
    console.log('✅ Firebase-Only SPA started successfully!');
    console.log(`🌐 Porta: ${availablePort} (forwarded to 80/443)`);
    console.log('🏠 Host: 0.0.0.0 (external access enabled)');
    console.log('🔥 Architettura: Firebase-Only (No Express)');
    console.log('📱 Modalità: SPA Development');
    
  } catch (error) {
    console.error('❌ Errore avvio server:', error);
    process.exit(1);
  }
}

startServer();