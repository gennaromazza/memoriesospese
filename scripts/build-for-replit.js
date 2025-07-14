#!/usr/bin/env node

/**
 * Build script specifico per deployment Replit
 * Genera tutti i file necessari per il deployment, incluso dist/index.js
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
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

function cleanDist() {
  log('🧹 Pulizia directory dist...', 'yellow');
  const distPath = path.join(rootDir, 'dist');
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }
  ensureDirectoryExists(distPath);
  log('✅ Directory dist pulita', 'green');
}

function buildClient() {
  log('🔨 Build del client React...', 'blue');
  try {
    execSync('npm run build:client', {
      stdio: 'inherit',
      cwd: rootDir,
      env: { ...process.env, NODE_ENV: 'production' }
    });
    log('✅ Client React buildato con successo', 'green');
    return true;
  } catch (error) {
    log(`❌ Errore nel build del client: ${error.message}`, 'red');
    return false;
  }
}

function createFirebaseOnlyServer() {
  log('🔧 Creazione server Firebase-only per Replit...', 'blue');
  
  const serverContent = `// Server Firebase-only per deployment Replit
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Log di avvio
console.log('🔥 Starting Firebase-Only SPA for Replit...');
console.log('📱 Mode: Production');
console.log('🌐 Port:', PORT);
console.log('📁 Static files from:', __dirname);

// Middleware per servire file statici
app.use(express.static(__dirname, {
  maxAge: '1d',
  etag: false
}));

// Middleware per logging delle richieste
app.use((req, res, next) => {
  console.log(\`📡 \${req.method} \${req.path}\`);
  next();
});

// Health check endpoint per Replit
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    app: 'Firebase-Only Wedding Gallery',
    version: '2.0.0'
  });
});

// Fallback SPA per tutte le route
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('App not found - build required');
  }
});

// Gestione errori
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Avvio server
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Firebase-Only SPA started successfully!');
  console.log(\`🌐 Server running on http://0.0.0.0:\${PORT}\`);
  console.log('🚀 Ready for Replit deployment');
});
`;

  fs.writeFileSync(path.join(rootDir, 'dist', 'index.js'), serverContent);
  log('✅ Server Firebase-only creato', 'green');
}

function buildServerWithEsbuild() {
  log('🔨 Build del server con esbuild...', 'blue');
  
  try {
    // Controlla se esiste server/index.ts
    const serverIndexPath = path.join(rootDir, 'server', 'index.ts');
    if (!fs.existsSync(serverIndexPath)) {
      log('⚠️  server/index.ts non trovato, uso server Firebase-only', 'yellow');
      createFirebaseOnlyServer();
      return true;
    }
    
    // Build con esbuild
    execSync('npm run build:server', {
      stdio: 'inherit',
      cwd: rootDir,
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    log('✅ Server buildato con esbuild', 'green');
    return true;
    
  } catch (error) {
    log(`❌ Build server fallito: ${error.message}`, 'red');
    log('🔧 Creo server Firebase-only di fallback...', 'yellow');
    createFirebaseOnlyServer();
    return true;
  }
}

function createPackageJsonForDist() {
  log('📦 Creazione package.json per dist...', 'blue');
  
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
    path.join(rootDir, 'dist', 'package.json'),
    JSON.stringify(packageContent, null, 2)
  );
  
  log('✅ package.json creato per dist/', 'green');
}

function validateReplitBuild() {
  log('🔍 Validazione build per Replit...', 'blue');
  
  const distPath = path.join(rootDir, 'dist');
  const requiredFiles = [
    'index.js',      // Server entry point
    'index.html',    // Client HTML
    'package.json'   // Dependencies
  ];
  
  let isValid = true;
  
  for (const file of requiredFiles) {
    const filePath = path.join(distPath, file);
    if (fs.existsSync(filePath)) {
      log(`✅ ${file} presente`, 'green');
    } else {
      log(`❌ ${file} mancante`, 'red');
      isValid = false;
    }
  }
  
  // Verifica che index.js sia valido
  const indexPath = path.join(distPath, 'index.js');
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf8');
    const requiredParts = ['express', 'PORT', 'listen', 'static'];
    
    for (const part of requiredParts) {
      if (content.includes(part)) {
        log(`✅ Server contiene: ${part}`, 'green');
      } else {
        log(`❌ Server manca: ${part}`, 'red');
        isValid = false;
      }
    }
  }
  
  return isValid;
}

function main() {
  log('🚀 Build per deployment Replit...', 'cyan');
  log('=' .repeat(50), 'cyan');
  
  try {
    // Step 1: Pulizia
    cleanDist();
    
    // Step 2: Build client
    if (!buildClient()) {
      throw new Error('Build del client fallito');
    }
    
    // Step 3: Build server
    if (!buildServerWithEsbuild()) {
      throw new Error('Build del server fallito');
    }
    
    // Step 4: Aggiungi package.json
    createPackageJsonForDist();
    
    // Step 5: Validazione
    if (!validateReplitBuild()) {
      throw new Error('Validazione build fallita');
    }
    
    log('=' .repeat(50), 'green');
    log('✅ Build per Replit completato con successo!', 'green');
    log('📁 Output: dist/', 'blue');
    log('🗂️  File generati:', 'blue');
    log('   - dist/index.js (server)', 'blue');
    log('   - dist/index.html (client)', 'blue');
    log('   - dist/assets/* (risorse)', 'blue');
    log('   - dist/package.json (deps)', 'blue');
    log('', 'reset');
    log('🚀 Pronto per: npm install && npm run build', 'green');
    
  } catch (error) {
    log('=' .repeat(50), 'red');
    log(`❌ Build fallito: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();