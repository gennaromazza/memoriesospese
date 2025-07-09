
// Build fix script - removed shebang for Node.js compatibility

/**
 * Script per correggere la struttura di build per il deployment
 * Sposta i file client da dist/ a dist/public/
 * Mantiene dist/index.js per il server
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

function fixBuildStructure() {
  log('🔧 Correzione struttura di build per deployment...', 'blue');
  
  const distDir = path.join(rootDir, 'dist');
  const publicDir = path.join(distDir, 'public');
  
  // Controlla se la directory dist esiste
  if (!fs.existsSync(distDir)) {
    log('❌ Directory dist non trovata. Esegui prima npm run build', 'red');
    process.exit(1);
  }
  
  // Crea la directory public se non esiste
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    log('✅ Creata directory dist/public/', 'green');
  }
  
  // File/cartelle da spostare in public (tutto tranne index.js del server)
  const allItems = fs.readdirSync(distDir);
  const itemsToMove = allItems.filter(item => item !== 'index.js' && item !== 'public');
  
  let movedItems = 0;
  
  for (const item of itemsToMove) {
    const sourcePath = path.join(distDir, item);
    const targetPath = path.join(publicDir, item);
    
    if (fs.existsSync(sourcePath)) {
      // Se il target esiste già, lo rimuoviamo prima
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      
      // Sposta il file/cartella
      fs.renameSync(sourcePath, targetPath);
      log(`✅ Spostato ${item} → dist/public/`, 'green');
      movedItems++;
    }
  }
  
  // Verifica che index.js del server sia rimasto in dist/
  const serverFile = path.join(distDir, 'index.js');
  if (!fs.existsSync(serverFile)) {
    log('⚠️  File server dist/index.js non trovato', 'yellow');
  } else {
    log('✅ File server dist/index.js mantenuto', 'green');
  }
  
  // Verifica la struttura finale
  const requiredFiles = ['index.html', 'assets'];
  const allExist = requiredFiles.every(file => 
    fs.existsSync(path.join(publicDir, file))
  );
  
  if (allExist) {
    log('✅ Struttura di build corretta per deployment', 'green');
    log(`📁 Server: dist/index.js`, 'blue');
    log(`📁 Client: dist/public/`, 'blue');
  } else {
    log('⚠️  Alcuni file potrebbero mancare nella struttura finale', 'yellow');
  }
  
  log(`🎉 Deployment ready! Spostati ${movedItems} elementi`, 'green');
}

// Esegui la correzione
try {
  fixBuildStructure();
} catch (error) {
  log(`❌ Errore durante la correzione: ${error.message}`, 'red');
  process.exit(1);
}
