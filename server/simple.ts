/**
 * Simple Vite Dev Server for Firebase Wedding Gallery App
 */

import { createServer } from 'vite'
import path from 'path'

async function startSimpleServer() {
  try {
    console.log('🔥 Starting simple Vite server...')
    
    const server = await createServer({
      root: path.resolve(process.cwd(), 'client'),
      server: {
        port: 5000,
        host: '0.0.0.0',
        open: false,
      },
      resolve: {
        alias: {
          "@": path.resolve(process.cwd(), "client", "src"),
          "@shared": path.resolve(process.cwd(), "shared"),
          "@assets": path.resolve(process.cwd(), "attached_assets"),
        },
      },
    })

    await server.listen()
    console.log('✅ Server started on http://0.0.0.0:5000')
    
  } catch (error) {
    console.error('❌ Server error:', error)
    process.exit(1)
  }
}

startSimpleServer()