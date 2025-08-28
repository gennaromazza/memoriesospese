/**
 * ⚡ Lightning Fast Dev Server
 * Ottimizzazione: Server Vite nativo + Config corretta
 */

import { createServer } from 'vite'

async function startServer() {
  const start = Date.now()
  
  try {
    console.log('⚡ Lightning fast startup...')
    
    // Usa configurazione Vite esistente (root del progetto)
    const server = await createServer({
      server: {
        port: 5000,
        host: '0.0.0.0',
        strictPort: false, // Trova porta automaticamente se 5000 occupata
      },
    })

    await server.listen()
    
    console.log(`🚀 Ready in ${Date.now() - start}ms`)
    console.log('🌐 Server: http://0.0.0.0:5000')
    console.log('⚡ Ottimizzazione: CONFIG ESISTENTE + ALIAS CORRETTI')
    
  } catch (error) {
    console.error('❌ Startup error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

startServer()