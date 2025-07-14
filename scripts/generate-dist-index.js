#!/usr/bin/env node

/**
 * Genera direttamente il file dist/index.js per il deployment Replit
 * Bypassa i problemi di timeout del build completo
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

function log(message, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
  };
  console.log(colors[color] + message + colors.reset);
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function main() {
  log('🚀 Generazione file dist/index.js per Replit...', 'cyan');
  
  const distPath = path.join(rootDir, 'dist');
  ensureDirectoryExists(distPath);
  
  // Server per Firebase-Only SPA ottimizzato per Replit
  const serverContent = `// Firebase-Only SPA Server per Replit Deployment
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Configurazione per Replit
const isProduction = process.env.NODE_ENV === 'production';
const basePath = process.env.VITE_BASE_PATH || '/';

console.log('🔥 Starting Firebase-Only SPA...');
console.log('📱 Mode:', isProduction ? 'Production' : 'Development');
console.log('🌐 Port:', PORT);
console.log('📁 Base Path:', basePath);
console.log('🗂️  Serving from:', __dirname);

// Middleware per servire file statici
app.use(express.static(__dirname, {
  maxAge: isProduction ? '1d' : '0',
  etag: false,
  index: false // Gestiamo manualmente l'index.html
}));

// Health check per Replit
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    app: 'Firebase-Only Wedding Gallery',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API endpoint per test
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Firebase-Only SPA funzionante',
    timestamp: new Date().toISOString()
  });
});

// Fallback per tutte le route SPA
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Fallback HTML se index.html non esiste
    const fallbackHtml = \`<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wedding Gallery - Firebase-Only</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            background: rgba(255,255,255,0.1);
            padding: 2rem;
            border-radius: 12px;
            backdrop-filter: blur(10px);
            text-align: center;
            max-width: 500px;
            border: 1px solid rgba(255,255,255,0.2);
        }
        h1 { margin-bottom: 1rem; }
        .status { margin: 0.5rem 0; opacity: 0.9; }
        .success { color: #4ade80; }
        .info { color: #60a5fa; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎉 Wedding Gallery</h1>
        <div class="status success">✅ Firebase-Only SPA Attiva</div>
        <div class="status info">📱 Server funzionante su porta \${PORT}</div>
        <div class="status info">🔥 Pronto per deployment Replit</div>
        <p>Il server è operativo. Esegui il build del client per l'app completa.</p>
    </div>
</body>
</html>\`;
    
    res.send(fallbackHtml);
  }
});

// Gestione errori
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Avvio server
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Firebase-Only SPA started successfully!');
  console.log(\`🌐 Server: http://0.0.0.0:\${PORT}\`);
  console.log('🚀 Ready for Replit deployment');
});

// Gestione segnali di terminazione
process.on('SIGTERM', () => {
  console.log('🔄 Ricevuto SIGTERM, terminazione graceful...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 Ricevuto SIGINT, terminazione graceful...');
  process.exit(0);
});
`;

  // Scrivi il file server
  fs.writeFileSync(path.join(distPath, 'index.js'), serverContent);
  
  // Crea package.json per dist
  const packageContent = {
    "name": "wedding-gallery-production",
    "version": "2.0.0",
    "type": "module",
    "main": "index.js",
    "scripts": {
      "start": "node index.js"
    },
    "dependencies": {
      "express": "^4.21.2"
    },
    "engines": {
      "node": ">=18.0.0"
    }
  };
  
  fs.writeFileSync(
    path.join(distPath, 'package.json'),
    JSON.stringify(packageContent, null, 2)
  );
  
  // Verifica che i file siano stati creati
  const indexPath = path.join(distPath, 'index.js');
  const packagePath = path.join(distPath, 'package.json');
  
  if (fs.existsSync(indexPath) && fs.existsSync(packagePath)) {
    log('✅ File dist/index.js generato con successo!', 'green');
    log('✅ File dist/package.json creato', 'green');
    log('🗂️  Struttura generata:', 'blue');
    log('   - dist/index.js (server entry point)', 'blue');
    log('   - dist/package.json (dependencies)', 'blue');
    log('', 'reset');
    log('🚀 Pronto per deployment Replit!', 'green');
    log('💡 Comandi deployment:', 'yellow');
    log('   npm install && npm run build', 'yellow');
    log('   node dist/index.js', 'yellow');
  } else {
    log('❌ Errore nella generazione dei file', 'red');
    process.exit(1);
  }
}

main();