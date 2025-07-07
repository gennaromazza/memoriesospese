#!/usr/bin/env node

/**
 * Script per correggere la struttura di build per il deployment
 * Questo script riorganizza i file di build nella struttura corretta
 * che il server si aspetta: dist/public/
 */

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

function fixBuildStructure() {
  log('🔧 Correzione struttura di build...', 'blue');
  
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
  
  // Lista dei file/cartelle da spostare in public
  const itemsToMove = ['index.html', 'assets', 'favicon.png'];
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
      log(`✅ Spostato ${item} in public/`, 'green');
      movedItems++;
    }
  }
  
  if (movedItems === 0) {
    log('⚠️  Nessun file da spostare trovato', 'yellow');
  } else {
    log(`🎉 Struttura di build corretta! Spostati ${movedItems} elementi`, 'green');
  }
  
  // Verifica la struttura finale
  const expectedFiles = ['index.html', 'assets'];
  const allExist = expectedFiles.every(file => 
    fs.existsSync(path.join(publicDir, file))
  );
  
  if (allExist) {
    log('✅ Struttura di build verificata e corretta', 'green');
  } else {
    log('⚠️  Alcuni file potrebbero mancare nella struttura finale', 'yellow');
  }
}

// Esegui la correzione
try {
  fixBuildStructure();
} catch (error) {
  log(`❌ Errore durante la correzione: ${error.message}`, 'red');
  process.exit(1);
}