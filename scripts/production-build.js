#!/usr/bin/env node

/**
 * Script completo per build di produzione
 * Risolve tutti i problemi di deployment identificati:
 * 1. Struttura directory corretta per static file serving
 * 2. Configurazione porta corretta (5000)
 * 3. Variabili d'ambiente per produzione
 * 4. Build del client e server
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Colori per output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function ensureProductionEnv() {
  log('🔧 Configurazione ambiente di produzione...', 'blue');
  
  // Imposta NODE_ENV=production per il processo corrente
  process.env.NODE_ENV = 'production';
  
  // Verifica che le variabili essenziali siano presenti
  const requiredEnvVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID'
  ];
  
  let missingVars = [];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
    }
  }
  
  if (missingVars.length > 0) {
    log(`⚠️  Variabili d'ambiente mancanti: ${missingVars.join(', ')}`, 'yellow');
    log('Continuando con configurazione di fallback...', 'yellow');
  } else {
    log('✅ Variabili d\'ambiente verificate', 'green');
  }
}

function cleanDistDirectory() {
  log('🧹 Pulizia directory dist...', 'blue');
  
  const distDir = path.join(rootDir, 'dist');
  
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
    log('✅ Directory dist pulita', 'green');
  }
  
  fs.mkdirSync(distDir, { recursive: true });
  log('✅ Directory dist ricreata', 'green');
}

function buildClient() {
  log('🏗️  Build del client...', 'blue');
  
  try {
    execSync('npx vite build', {
      stdio: 'inherit',
      cwd: rootDir,
      env: { ...process.env, NODE_ENV: 'production' }
    });
    log('✅ Build del client completata', 'green');
    return true;
  } catch (error) {
    log(`❌ Errore durante build del client: ${error.message}`, 'red');
    return false;
  }
}

function fixStaticFileStructure() {
  log('🔧 Correzione struttura file statici...', 'blue');
  
  const distDir = path.join(rootDir, 'dist');
  const publicDir = path.join(distDir, 'public');
  
  // Crea la directory public
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  // Lista dei file da spostare nella directory public
  const itemsToMove = [];
  const distContents = fs.readdirSync(distDir);
  
  for (const item of distContents) {
    if (item !== 'public' && item !== 'index.js') {
      itemsToMove.push(item);
    }
  }
  
  // Sposta i file nella directory public
  let movedItems = 0;
  for (const item of itemsToMove) {
    const sourcePath = path.join(distDir, item);
    const targetPath = path.join(publicDir, item);
    
    try {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      
      fs.renameSync(sourcePath, targetPath);
      movedItems++;
    } catch (error) {
      log(`⚠️  Errore spostando ${item}: ${error.message}`, 'yellow');
    }
  }
  
  log(`✅ Spostati ${movedItems} elementi in public/`, 'green');
  
  // Verifica che index.html esista
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    log('✅ index.html presente in public/', 'green');
  } else {
    log('❌ index.html non trovato in public/', 'red');
    return false;
  }
  
  return true;
}

function buildServer() {
  log('🏗️  Build del server...', 'blue');
  
  try {
    execSync('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', {
      stdio: 'inherit',
      cwd: rootDir,
      env: { ...process.env, NODE_ENV: 'production' }
    });
    log('✅ Build del server completata', 'green');
    return true;
  } catch (error) {
    log(`❌ Errore durante build del server: ${error.message}`, 'red');
    return false;
  }
}

function createProductionStartScript() {
  log('📄 Creazione script di avvio produzione...', 'blue');
  
  const startScript = `#!/bin/bash
# Script di avvio per produzione
export NODE_ENV=production
export PORT=5000

echo "🚀 Avvio applicazione in modalità produzione..."
echo "📁 Directory: $(pwd)"
echo "🔧 Ambiente: $NODE_ENV"
echo "🌐 Porta: $PORT"

# Verifica che i file necessari esistano
if [ ! -f "dist/index.js" ]; then
  echo "❌ File server non trovato. Esegui build prima."
  exit 1
fi

if [ ! -f "dist/public/index.html" ]; then
  echo "❌ File client non trovati. Esegui build prima."
  exit 1
fi

echo "✅ File verificati, avvio server..."
node dist/index.js
`;
  
  fs.writeFileSync(path.join(rootDir, 'start-production.sh'), startScript);
  
  // Rendi il file eseguibile
  try {
    execSync('chmod +x start-production.sh', { cwd: rootDir });
    log('✅ Script di avvio creato: start-production.sh', 'green');
  } catch (error) {
    log('⚠️  Errore impostando permessi script', 'yellow');
  }
}

function createDockerignore() {
  log('📄 Creazione .dockerignore...', 'blue');
  
  const dockerignoreContent = `node_modules
.git
.env
.env.local
*.log
dist
client/dist
server/dist
`;
  
  fs.writeFileSync(path.join(rootDir, '.dockerignore'), dockerignoreContent);
  log('✅ .dockerignore creato', 'green');
}

function verifyBuild() {
  log('🔍 Verifica build...', 'blue');
  
  const distDir = path.join(rootDir, 'dist');
  const publicDir = path.join(distDir, 'public');
  const serverFile = path.join(distDir, 'index.js');
  const clientIndex = path.join(publicDir, 'index.html');
  
  const checks = [
    { path: distDir, name: 'Directory dist' },
    { path: publicDir, name: 'Directory public' },
    { path: serverFile, name: 'Server build (index.js)' },
    { path: clientIndex, name: 'Client build (index.html)' }
  ];
  
  let allPassed = true;
  for (const check of checks) {
    if (fs.existsSync(check.path)) {
      log(`✅ ${check.name}`, 'green');
    } else {
      log(`❌ ${check.name} mancante`, 'red');
      allPassed = false;
    }
  }
  
  if (allPassed) {
    log('🎉 Build verificata e pronta per deployment!', 'green');
    
    // Mostra statistiche dei file
    const stats = fs.statSync(serverFile);
    const clientStats = fs.statSync(clientIndex);
    
    log(`📊 Statistiche build:`, 'blue');
    log(`   - Server: ${(stats.size / 1024).toFixed(2)} KB`);
    log(`   - Client: ${(clientStats.size / 1024).toFixed(2)} KB`);
    
    const assetsDir = path.join(publicDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      const assetFiles = fs.readdirSync(assetsDir);
      log(`   - Assets: ${assetFiles.length} file`);
    }
  }
  
  return allPassed;
}

// Funzione principale
function main() {
  log('🚀 Avvio build di produzione completa...', 'blue');
  log('=' .repeat(50), 'blue');
  
  try {
    // 1. Configurazione ambiente
    ensureProductionEnv();
    
    // 2. Pulizia
    cleanDistDirectory();
    
    // 3. Build client
    if (!buildClient()) {
      throw new Error('Build client fallita');
    }
    
    // 4. Correzione struttura file statici
    if (!fixStaticFileStructure()) {
      throw new Error('Correzione struttura file fallita');
    }
    
    // 5. Build server
    if (!buildServer()) {
      throw new Error('Build server fallita');
    }
    
    // 6. Creazione script di supporto
    createProductionStartScript();
    createDockerignore();
    
    // 7. Verifica finale
    if (verifyBuild()) {
      log('=' .repeat(50), 'green');
      log('🎉 BUILD DI PRODUZIONE COMPLETATA CON SUCCESSO!', 'green');
      log('=' .repeat(50), 'green');
      
      log('\n📋 Prossimi passi per il deployment:', 'blue');
      log('1. Per testare localmente: ./start-production.sh', 'yellow');
      log('2. Per Replit Deploy: usa la cartella dist/ come root', 'yellow');
      log('3. Per server esterno: carica dist/ e avvia con node dist/index.js', 'yellow');
      log('4. Assicurati che la porta 5000 sia esposta', 'yellow');
    } else {
      throw new Error('Verifica build fallita');
    }
    
  } catch (error) {
    log('=' .repeat(50), 'red');
    log(`❌ BUILD FALLITA: ${error.message}`, 'red');
    log('=' .repeat(50), 'red');
    process.exit(1);
  }
}

// Esegui build
main();