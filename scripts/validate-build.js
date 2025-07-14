#!/usr/bin/env node

/**
 * Validation script per verificare che il build sia corretto
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

function validateBuildStructure() {
  log('🔍 VALIDAZIONE STRUTTURA BUILD', 'cyan');
  log('============================', 'cyan');
  
  const distPath = path.join(rootDir, 'dist');
  const requiredFiles = [
    { file: 'index.html', description: 'Entry point HTML' },
    { file: 'index.js', description: 'Server fallback' },
    { file: 'assets', description: 'Static assets directory' }
  ];
  
  let allValid = true;
  
  // Verifica che dist esista
  if (!fs.existsSync(distPath)) {
    log('❌ Directory dist/ non esiste', 'red');
    return false;
  }
  
  // Verifica ogni file richiesto
  for (const { file, description } of requiredFiles) {
    const filePath = path.join(distPath, file);
    if (fs.existsSync(filePath)) {
      log(`✅ ${file} - ${description}`, 'green');
    } else {
      log(`❌ ${file} - ${description} - MANCANTE`, 'red');
      allValid = false;
    }
  }
  
  return allValid;
}

function validateServerFile() {
  log('\n🔍 VALIDAZIONE SERVER FILE', 'cyan');
  log('========================', 'cyan');
  
  const serverPath = path.join(rootDir, 'dist', 'index.js');
  
  if (!fs.existsSync(serverPath)) {
    log('❌ dist/index.js non esiste', 'red');
    return false;
  }
  
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  // Verifica che contenga le parti essenziali
  const requiredParts = [
    'express',
    'app.listen',
    'PORT',
    'static',
    'Firebase-Only SPA'
  ];
  
  let allValid = true;
  
  for (const part of requiredParts) {
    if (serverContent.includes(part)) {
      log(`✅ Contiene: ${part}`, 'green');
    } else {
      log(`❌ Manca: ${part}`, 'red');
      allValid = false;
    }
  }
  
  return allValid;
}

function showDeploymentInfo() {
  log('\n🚀 INFORMAZIONI DEPLOYMENT', 'cyan');
  log('=========================', 'cyan');
  
  log('📁 Struttura build:', 'blue');
  log('  dist/index.html - Entry point SPA', 'green');
  log('  dist/index.js - Server fallback', 'green');
  log('  dist/assets/ - Static assets', 'green');
  log('', 'reset');
  
  log('🔧 Comandi per deployment:', 'blue');
  log('  npm start - Avvia server produzione', 'green');
  log('  PORT=5000 npm start - Porta custom', 'green');
  log('', 'reset');
  
  log('🌐 Architettura:', 'blue');
  log('  Firebase-Only SPA con server fallback', 'green');
  log('  Nessun database server necessario', 'green');
  log('  Tutti i dati tramite Firebase SDK', 'green');
  log('', 'reset');
  
  log('✅ PRONTO PER DEPLOYMENT!', 'green');
}

function main() {
  try {
    const structureValid = validateBuildStructure();
    const serverValid = validateServerFile();
    
    if (structureValid && serverValid) {
      log('\n✅ VALIDAZIONE COMPLETATA - BUILD CORRETTO', 'green');
      showDeploymentInfo();
    } else {
      log('\n❌ VALIDAZIONE FALLITA - CORREGGERE ERRORI', 'red');
      process.exit(1);
    }
    
  } catch (error) {
    log('\n❌ ERRORE DURANTE VALIDAZIONE', 'red');
    console.error(error);
    process.exit(1);
  }
}

main();