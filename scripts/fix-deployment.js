// Deployment fix script

/**
 * Script per correggere i problemi di deployment identificati:
 * 1. Creazione directory dist/public/ mancante
 * 2. Configurazione porta corretta (5000)
 * 3. Struttura file per static serving
 * 4. Validazione completa deployment
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log(`✓ Creata directory: ${dirPath}`, 'green');
    return true;
  }
  return false;
}

function fixBuildStructure() {
  log('🔧 Correzione struttura build per deployment...', 'blue');
  
  const rootDir = process.cwd();
  const distDir = path.join(rootDir, 'dist');
  const publicDir = path.join(distDir, 'public');
  
  // Verifica che la directory dist esista
  if (!fs.existsSync(distDir)) {
    log('❌ Directory dist non trovata. Eseguendo build...', 'red');
    try {
      execSync('npm run build', { stdio: 'inherit' });
    } catch (error) {
      log('❌ Build fallita', 'red');
      process.exit(1);
    }
  }
  
  // Crea directory public se non esiste
  ensureDirectoryExists(publicDir);
  
  // Lista file da spostare in public/
  const itemsToMove = [
    'index.html',
    'assets',
    'favicon.png',
    'favicon.ico',
    'manifest.json',
    '.htaccess'
  ];
  
  let movedItems = 0;
  
  for (const item of itemsToMove) {
    const sourcePath = path.join(distDir, item);
    const targetPath = path.join(publicDir, item);
    
    if (fs.existsSync(sourcePath)) {
      // Rimuovi target se esiste
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      
      // Sposta file/directory
      fs.renameSync(sourcePath, targetPath);
      log(`  ✓ Spostato ${item} → public/`, 'green');
      movedItems++;
    }
  }
  
  log(`✅ Struttura corretta! Spostati ${movedItems} elementi`, 'green');
  return true;
}

function validateDeployment() {
  log('🔍 Validazione deployment...', 'blue');
  
  const checks = [
    { path: 'dist/index.js', name: 'Server Bundle', critical: true },
    { path: 'dist/public/index.html', name: 'Client HTML', critical: true },
    { path: 'dist/public/assets', name: 'Assets Directory', critical: false }
  ];
  
  let errors = 0;
  let warnings = 0;
  
  checks.forEach(check => {
    const fullPath = path.join(process.cwd(), check.path);
    if (fs.existsSync(fullPath)) {
      log(`  ✓ ${check.name}`, 'green');
    } else if (check.critical) {
      log(`  ✗ ${check.name} - CRITICO`, 'red');
      errors++;
    } else {
      log(`  ? ${check.name} - opzionale`, 'yellow');
      warnings++;
    }
  });
  
  // Verifica configurazione porta nel server
  const serverFile = path.join(process.cwd(), 'dist', 'index.js');
  if (fs.existsSync(serverFile)) {
    const serverContent = fs.readFileSync(serverFile, 'utf8');
    if (serverContent.includes('5000')) {
      log('  ✓ Porta 5000 configurata correttamente', 'green');
    } else {
      log('  ? Configurazione porta da verificare', 'yellow');
      warnings++;
    }
  }
  
  // Risultato finale
  if (errors === 0) {
    log(`🎉 DEPLOYMENT PRONTO! (${warnings} avvisi non critici)`, 'green');
    return true;
  } else {
    log(`❌ DEPLOYMENT FALLITO! ${errors} errori critici`, 'red');
    return false;
  }
}

function createHealthCheck() {
  log('🏥 Creazione endpoint health check...', 'blue');
  
  const healthScript = `
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/health',
  method: 'GET',
  timeout: 3000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log('✅ Health check OK');
    process.exit(0);
  } else {
    console.log(\`❌ Health check failed with status: \${res.statusCode}\`);
    process.exit(1);
  }
});

req.on('timeout', () => {
  console.log('❌ Health check timeout');
  req.destroy();
  process.exit(1);
});

req.on('error', (error) => {
  console.log(\`❌ Health check error: \${error.message}\`);
  process.exit(1);
});

req.end();
`;
  
  fs.writeFileSync('health-check.js', healthScript);
  log('  ✓ Script health check creato', 'green');
}

function showDeploymentInstructions() {
  log('\n🚀 ISTRUZIONI DEPLOYMENT', 'cyan');
  log('=' .repeat(50), 'cyan');
  
  log('\n📁 Struttura creata:', 'yellow');
  log('  ├── dist/index.js          (server)', 'yellow');
  log('  ├── dist/public/           (static files)', 'yellow');
  log('  │   ├── index.html', 'yellow');
  log('  │   └── assets/', 'yellow');
  log('  └── health-check.js        (monitoring)', 'yellow');
  
  log('\n🌐 Comandi di deployment:', 'yellow');
  log('  • Avvio produzione: NODE_ENV=production node dist/index.js', 'green');
  log('  • Health check:     node health-check.js', 'green');
  log('  • Porta server:     5000', 'green');
  
  log('\n💡 Per Replit:', 'blue');
  log('  1. Vai su Deployments', 'cyan');
  log('  2. Seleziona "Autoscale Deployment"', 'cyan');
  log('  3. Il server partirà automaticamente su porta 5000', 'cyan');
  
  log('\n✅ Deployment pronto!', 'green');
}

async function main() {
  try {
    log('🚀 AVVIO CORREZIONE DEPLOYMENT', 'blue');
    log('=' .repeat(50), 'blue');
    
    // 1. Correggi struttura build
    fixBuildStructure();
    
    // 2. Crea health check
    createHealthCheck();
    
    // 3. Valida deployment 
    const isValid = validateDeployment();
    
    if (isValid) {
      // 4. Mostra istruzioni
      showDeploymentInstructions();
      process.exit(0);
    } else {
      log('❌ Correzioni necessarie prima del deployment', 'red');
      process.exit(1);
    }
    
  } catch (error) {
    log(`❌ Errore durante la correzione: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Esecuzione
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fixBuildStructure, validateDeployment };