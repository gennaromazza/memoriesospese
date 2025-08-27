/**
 * Firebase-Only SPA Server using existing Vite config
 */

import { createServer } from 'vite'

async function startServer() {
  try {
    console.log('🔥 Starting Firebase-Only SPA...')
    
    // Use the existing vite.config.ts configuration with strict port for Replit
    const server = await createServer({
      configFile: 'vite.config.ts', // Use the existing config
      server: {
        port: 5000,
        host: '0.0.0.0',
        strictPort: true, // Replit workflows require port 5000
        open: false,
      },
    })

    await server.listen()
    console.log('✅ Firebase-Only SPA started successfully!')
    console.log('🌐 Server running on http://0.0.0.0:5000')
    console.log('🔥 Architettura: Firebase-Only (No Express)')
    console.log('📱 Modalità: SPA Development')
    
  } catch (error) {
    console.error('❌ Server startup error:', error)
    process.exit(1)
  }
}

startServer()