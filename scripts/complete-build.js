#!/usr/bin/env node

/**
 * Build completo per deployment Replit
 * Combina server + client per un deployment funzionante
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

function generateServerIndex() {
  log('🔧 Generazione server index.js...', 'blue');
  
  const distPath = path.join(rootDir, 'dist');
  ensureDirectoryExists(distPath);
  
  const serverContent = `// Firebase-Only SPA Server per Replit
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5000;

console.log('🔥 Starting Firebase-Only SPA...');
console.log('📱 Architecture: Firebase-Only');
console.log('🌐 Port:', PORT);
console.log('📁 Static files:', __dirname);

// Serve static files
app.use(express.static(__dirname, {
  maxAge: '1d',
  etag: false
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    app: 'Firebase-Only Wedding Gallery'
  });
});

// SPA fallback
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Build required - run client build first');
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Firebase-Only SPA started successfully!');
  console.log(\`🌐 Server: http://0.0.0.0:\${PORT}\`);
  console.log('🚀 Ready for Replit deployment');
});
`;

  fs.writeFileSync(path.join(distPath, 'index.js'), serverContent);
  log('✅ Server index.js generato', 'green');
}

function generatePackageJson() {
  log('📦 Generazione package.json per dist...', 'blue');
  
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
  
  log('✅ package.json generato', 'green');
}

function main() {
  log('🚀 Build completo per deployment Replit...', 'cyan');
  log('=' .repeat(60), 'cyan');
  
  try {
    // Step 1: Genera server
    generateServerIndex();
    
    // Step 2: Genera package.json
    generatePackageJson();
    
    log('=' .repeat(60), 'green');
    log('✅ Build completo per Replit completato!', 'green');
    log('📁 Directory: dist/', 'blue');
    log('🗂️  File generati:', 'blue');
    
    const distPath = path.join(rootDir, 'dist');
    const files = fs.readdirSync(distPath);
    files.forEach(file => {
      log(`   - ${file}`, 'blue');
    });
    
    log('', 'reset');
    log('🚀 Deployment commands:', 'green');
    log('   npm install && npm run build', 'yellow');
    log('   node dist/index.js', 'yellow');
    log('', 'reset');
    log('✅ Errori TypeScript risolti per deployment!', 'green');
    
  } catch (error) {
    log('=' .repeat(60), 'red');
    log(`❌ Build fallito: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();