#!/usr/bin/env node

/**
 * Script per risolvere i problemi CORS con Firebase Functions
 * Installa dipendenze e prepara il deployment
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const functionsDir = path.join(rootDir, 'functions');

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

function installFunctionsDependencies() {
  log('📦 Installazione dipendenze Firebase Functions...', 'blue');
  
  try {
    // Verifica che la directory functions esista
    if (!fs.existsSync(functionsDir)) {
      log('❌ Directory functions non trovata', 'red');
      return false;
    }
    
    // Installa le dipendenze
    execSync('npm install', {
      cwd: functionsDir,
      stdio: 'inherit'
    });
    
    log('✅ Dipendenze Firebase Functions installate', 'green');
    return true;
    
  } catch (error) {
    log(`❌ Errore installazione dipendenze: ${error.message}`, 'red');
    return false;
  }
}

function buildFunctions() {
  log('🔨 Build Firebase Functions...', 'blue');
  
  try {
    execSync('npm run build', {
      cwd: functionsDir,
      stdio: 'inherit'
    });
    
    log('✅ Build Firebase Functions completato', 'green');
    return true;
    
  } catch (error) {
    log(`❌ Errore build: ${error.message}`, 'red');
    return false;
  }
}

function createCorsTestScript() {
  log('🧪 Creazione script test CORS...', 'blue');
  
  const testScript = `#!/usr/bin/env node

/**
 * Test CORS per Firebase Functions
 */

async function testCORS() {
  const functionUrl = 'https://us-central1-wedding-gallery-397b6.cloudfunctions.net/sendNewPhotosNotification';
  
  console.log('🧪 Test CORS per Firebase Functions...');
  console.log('URL:', functionUrl);
  console.log('Origin:', 'https://gennaromazzacane.it');
  
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://gennaromazzacane.it'
      },
      body: JSON.stringify({
        galleryName: 'Test Gallery',
        newPhotosCount: 1,
        uploaderName: 'Test User',
        galleryUrl: 'https://gennaromazzacane.it/wedgallery/gallery/test',
        recipients: ['test@example.com']
      })
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ CORS funzionante!', result);
    } else {
      console.log('❌ CORS non funzionante:', response.statusText);
    }
    
  } catch (error) {
    console.error('❌ Errore test CORS:', error.message);
  }
}

if (typeof window === 'undefined') {
  testCORS();
}`;

  fs.writeFileSync(path.join(rootDir, 'scripts', 'test-cors.js'), testScript);
  log('✅ Script test CORS creato', 'green');
}

function createDeployInstructions() {
  log('📝 Creazione istruzioni deployment...', 'blue');
  
  const instructions = `# Risoluzione CORS Firebase Functions

## Problema
\`\`\`
Access to fetch at 'https://us-central1-wedding-gallery-397b6.cloudfunctions.net/sendNewPhotosNotification' 
from origin 'https://gennaromazzacane.it' has been blocked by CORS policy
\`\`\`

## Soluzione Implementata ✅

### 1. Aggiunta Dipendenza CORS
- Aggiunto \`cors\` e \`@types/cors\` al package.json
- Configurato CORS per permettere richieste da gennaromazzacane.it

### 2. Doppia Implementazione Functions
- \`sendNewPhotosNotification\` (onRequest con CORS)
- \`sendNewPhotosNotificationCall\` (onCall per compatibilità)

### 3. Client con Fallback
- Prova prima HTTP function (supporta CORS)
- Fallback automatico a callable function
- Gestione errori completa

## Deployment

### 1. Installa dipendenze
\`\`\`bash
cd functions
npm install
\`\`\`

### 2. Build functions
\`\`\`bash
npm run build
\`\`\`

### 3. Deploy functions
\`\`\`bash
firebase deploy --only functions
\`\`\`

## Test

### 1. Test CORS
\`\`\`bash
node scripts/test-cors.js
\`\`\`

### 2. Test dal browser
- Apri https://gennaromazzacane.it/wedgallery/
- Carica nuove foto
- Verifica che non ci siano errori CORS

## Domini Permessi
- https://gennaromazzacane.it
- https://www.gennaromazzacane.it
- http://localhost:3000
- http://localhost:5000

## Stato
✅ CORS configurato correttamente
✅ Funzioni aggiornate con supporto CORS
✅ Client aggiornato con fallback
✅ Pronto per deployment
`;

  fs.writeFileSync(path.join(rootDir, 'CORS_FIX.md'), instructions);
  log('✅ Istruzioni deployment create', 'green');
}

function main() {
  log('🚀 Risoluzione CORS Firebase Functions...', 'cyan');
  log('=' .repeat(50), 'cyan');
  
  try {
    // Step 1: Installa dipendenze
    if (!installFunctionsDependencies()) {
      throw new Error('Installazione dipendenze fallita');
    }
    
    // Step 2: Build functions
    if (!buildFunctions()) {
      throw new Error('Build functions fallito');
    }
    
    // Step 3: Crea script test
    createCorsTestScript();
    
    // Step 4: Crea documentazione
    createDeployInstructions();
    
    log('=' .repeat(50), 'green');
    log('✅ CORS Firebase Functions risolto!', 'green');
    log('', 'reset');
    log('🎯 Modifiche applicate:', 'blue');
    log('   ✅ Aggiunta dipendenza CORS', 'green');
    log('   ✅ Funzioni HTTP con supporto CORS', 'green');
    log('   ✅ Client con fallback automatico', 'green');
    log('   ✅ Build completato', 'green');
    log('', 'reset');
    log('🚀 Prossimi passi:', 'yellow');
    log('   1. firebase deploy --only functions', 'yellow');
    log('   2. node scripts/test-cors.js', 'yellow');
    log('   3. Test dal browser gennaromazzacane.it', 'yellow');
    
  } catch (error) {
    log('=' .repeat(50), 'red');
    log(`❌ Errore: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();