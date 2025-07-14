#!/usr/bin/env node

/**
 * Validation script per Firebase-Only SPA
 * Verifica che tutto sia configurato correttamente prima del deployment
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
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
  };
  console.log(colors[color] + message + colors.reset);
}

function check(description, condition, errorMsg, warningMsg) {
  console.log(`🔍 ${description}`);
  
  if (condition) {
    console.log('   ✅ OK\n');
    return true;
  } else {
    if (errorMsg) {
      console.log(`   ❌ ERROR: ${errorMsg}\n`);
      return false;
    } else if (warningMsg) {
      console.log(`   ⚠️  WARNING: ${warningMsg}\n`);
      return true;
    }
    return false;
  }
}

function validateFirebaseConfig() {
  log('🔥 VALIDAZIONE CONFIGURAZIONE FIREBASE-ONLY SPA', 'cyan');
  log('==============================================', 'cyan');
  
  let allValid = true;
  
  // 1. Verifica struttura client
  const clientExists = fs.existsSync(path.join(rootDir, 'client'));
  if (!check('Client directory exists', clientExists, 'Directory client/ non trovata')) {
    allValid = false;
  }
  
  // 2. Verifica configurazione Firebase
  const firebaseConfigExists = fs.existsSync(path.join(rootDir, 'firebase.json'));
  if (!check('Firebase configuration exists', firebaseConfigExists, 'File firebase.json non trovato')) {
    allValid = false;
  }
  
  // 3. Verifica configurazione Vite
  const viteConfigExists = fs.existsSync(path.join(rootDir, 'vite.config.ts'));
  if (!check('Vite configuration exists', viteConfigExists, 'File vite.config.ts non trovato')) {
    allValid = false;
  }
  
  // 4. Verifica setup Firebase nel client
  const clientSrcExists = fs.existsSync(path.join(rootDir, 'client', 'src'));
  if (!check('Client source directory exists', clientSrcExists, 'Directory client/src/ non trovata')) {
    allValid = false;
  }
  
  // 5. Verifica che non ci siano dipendenze server Express
  const packageJsonPath = path.join(rootDir, 'package.json');
  let hasExpressServer = false;
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const startScript = packageJson.scripts?.start;
    hasExpressServer = startScript && startScript.includes('node') && startScript.includes('server');
  }
  
  if (!check('No Express server in start script', !hasExpressServer, 
    null, 'Start script potrebbe richiedere un server Node.js - per Firebase-Only SPA usa solo file statici')) {
    // Warning only, not blocking
  }
  
  // 6. Verifica TypeScript configuration
  const tsconfigExists = fs.existsSync(path.join(rootDir, 'tsconfig.json'));
  if (check('TypeScript configuration exists', tsconfigExists, 'File tsconfig.json non trovato')) {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'tsconfig.json'), 'utf8'));
    const hasClientInclude = tsconfig.include?.some(path => path.includes('client'));
    check('TypeScript includes client', hasClientInclude, 'tsconfig.json deve includere client/src/**/*');
  }
  
  // 7. Verifica script di build
  const buildScriptExists = fs.existsSync(path.join(rootDir, 'scripts', 'build-firebase-spa.js'));
  if (!check('Build script exists', buildScriptExists, 'Script build-firebase-spa.js non trovato')) {
    allValid = false;
  }
  
  return allValid;
}

function showRecommendations() {
  log('\n📋 RACCOMANDAZIONI PER FIREBASE-ONLY SPA', 'blue');
  log('=====================================', 'blue');
  log('1. ✅ Usa solo Firebase services (Firestore, Storage, Auth)', 'green');
  log('2. ✅ Build genera solo file statici (HTML/CSS/JS)', 'green');
  log('3. ✅ Nessun server Express necessario in produzione', 'green');
  log('4. ✅ Routing gestito completamente nel client', 'green');
  log('5. ✅ API calls solo verso Firebase SDK', 'green');
  log('', 'reset');
  log('🚀 Per build: npm run build', 'cyan');
  log('🔧 Per build custom: node scripts/build-firebase-spa.js', 'cyan');
}

function main() {
  try {
    const isValid = validateFirebaseConfig();
    
    if (isValid) {
      log('✅ VALIDAZIONE COMPLETATA - CONFIGURAZIONE CORRETTA', 'green');
      showRecommendations();
    } else {
      log('❌ VALIDAZIONE FALLITA - CORREGGERE ERRORI', 'red');
      process.exit(1);
    }
    
  } catch (error) {
    log('❌ ERRORE DURANTE VALIDAZIONE', 'red');
    console.error(error);
    process.exit(1);
  }
}

main();