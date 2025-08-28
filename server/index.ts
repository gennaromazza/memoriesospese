/**
 * Optimized Firebase-Only SPA Server
 */

import { createServer } from 'vite'

// Pre-import plugins per evitare import dinamici costosi
import react from '@vitejs/plugin-react'

async function startServer() {
  try {
    console.log('🚀 Starting optimized dev server...')
    
    // Config minima per massima velocità
    const server = await createServer({
      configFile: 'vite.config.ts', // Usa config esistente invece di ricreare
      server: {
        port: 5000,
        host: '0.0.0.0',
        strictPort: false,
        open: false,
      },
    })

    await server.listen()
    console.log('✅ Dev server ready!')
    console.log('🌐 http://0.0.0.0:5000')
    
  } catch (error) {
    console.error('❌ Server error:', error)
    process.exit(1)
  }
}

startServer()