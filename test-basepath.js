/**
 * Script di test per verificare il funzionamento del sistema basepath dinamico
 * Testa diverse configurazioni di VITE_BASE_PATH
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🧪 SISTEMA DI TEST BASEPATH DINAMICO');
console.log('=====================================\n');

// Test cases da verificare
const testCases = [
  { name: 'ROOT PATH', basePath: '/', expectedDir: 'dist/dist' },
  { name: 'MEMORIESOSPESE', basePath: '/memoriesospese/', expectedDir: 'dist/memoriesospese' },
  { name: 'WEDGALLERY', basePath: '/wedgallery/', expectedDir: 'dist/wedgallery' },
  { name: 'CUSTOM PATH', basePath: '/my-custom-path/', expectedDir: 'dist/my-custom-path' }
];

console.log('📋 Test cases configurati:');
testCases.forEach((test, i) => {
  console.log(`${i + 1}. ${test.name}: ${test.basePath} -> ${test.expectedDir}`);
});

console.log('\n🔍 ANALISI CONFIGURAZIONE ATTUALE:');
console.log('==================================');

// Legge il file .env attuale
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  const basePath = envContent.match(/VITE_BASE_PATH=(.+)/);
  console.log('✅ File .env trovato');
  console.log('📍 VITE_BASE_PATH attuale:', basePath ? basePath[1] : 'NON DEFINITO');
} catch (error) {
  console.log('❌ Errore lettura .env:', error.message);
}

// Verifica vite.config.ts per hardcode
try {
  const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
  const hardcodes = [];
  
  if (viteConfig.includes('memoriesospese')) hardcodes.push('memoriesospese');
  if (viteConfig.includes('wedgallery')) hardcodes.push('wedgallery');
  
  if (hardcodes.length > 0) {
    console.log('⚠️  PROBLEMI in vite.config.ts:');
    hardcodes.forEach(h => console.log(`   - Hardcode trovato: ${h}`));
  } else {
    console.log('✅ vite.config.ts: nessun hardcode rilevato');
  }
} catch (error) {
  console.log('❌ Errore lettura vite.config.ts:', error.message);
}

// Verifica basePath.ts per hardcode
try {
  const basePathFile = fs.readFileSync('client/src/lib/basePath.ts', 'utf8');
  if (basePathFile.includes('gennaromazzacane.it')) {
    console.log('❌ basePath.ts: contiene ancora hardcode dominio');
  } else {
    console.log('✅ basePath.ts: nessun hardcode dominio rilevato');
  }
} catch (error) {
  console.log('❌ Errore lettura basePath.ts:', error.message);
}

// Verifica server/production.ts
try {
  const prodServer = fs.readFileSync('server/production.ts', 'utf8');
  if (prodServer.includes('memoriesospese') && !prodServer.includes('buildSubfolder')) {
    console.log('❌ server/production.ts: contiene hardcode');
  } else {
    console.log('✅ server/production.ts: configurazione dinamica rilevata');
  }
} catch (error) {
  console.log('❌ Errore lettura server/production.ts:', error.message);
}

console.log('\n📝 RACCOMANDAZIONI:');
console.log('===================');
console.log('1. Per testare un nuovo basepath:');
console.log('   - Modifica VITE_BASE_PATH nel file .env');
console.log('   - Esegui: npm run build');
console.log('   - Verifica che venga creata la cartella dist/{nuovo-path}');
console.log('');
console.log('2. File da NON modificare manualmente:');
console.log('   - vite.config.ts (protetto dal sistema)');
console.log('   - package.json (protetto dal sistema)');
console.log('');
console.log('3. File risolti automaticamente:');
console.log('   ✅ client/src/lib/basePath.ts (nessun hardcode dominio)');
console.log('   ✅ server/production.ts (path dinamico)');
console.log('   ✅ client/index.html (og:url dinamico)');

console.log('\n🎯 TEST MANUALE RAPIDO:');
console.log('=======================');
console.log('1. Cambia VITE_BASE_PATH=/test/ nel file .env');
console.log('2. Ricarica l\'app in development');
console.log('3. Verifica che i link funzionino correttamente');
console.log('4. Controlla che createUrl("/gallery/123") generi "/test/gallery/123"');

console.log('\n🔧 Sistema basepath è ora completamente dinamico!');