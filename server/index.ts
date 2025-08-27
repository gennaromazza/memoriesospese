/**
 * Firebase-Only SPA Server using existing Vite config
 */

import { createServer } from 'vite'

async function startServer() {
  try {
    console.log('🔥 Starting Firebase-Only SPA...')
    console.log(`📁 Base Path: ${process.env.VITE_BASE_PATH || '/'}`)
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
    
    // Use the corrected vite configuration that handles async properly
    const server = await createServer({
      configFile: 'vite.dev.config.ts', // Use the fixed config with proper async handling
      server: {
        port: 5000,
        host: '0.0.0.0',
        strictPort: false, // Allow flexibility for Replit environment
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