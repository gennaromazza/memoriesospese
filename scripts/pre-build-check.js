// Pre-build check script

/**
 * Script di verifica pre-build per deployment Netsons
 * Controlla che tutto sia configurato correttamente
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 VERIFICA PRE-BUILD PER NETSONS');
console.log('================================\n');

let errors = [];
let warnings = [];
let checks = 0;

function check(description, condition, errorMsg, warningMsg) {
  checks++;
  console.log(`${checks}. ${description}`);
  
  if (condition) {
    console.log('   ✅ OK\n');
    return true;
  } else {
    if (errorMsg) {
      console.log(`   ❌ ERROR: ${errorMsg}\n`);
      errors.push(errorMsg);
    } else if (warningMsg) {
      console.log(`   ⚠️  WARNING: ${warningMsg}\n`);
      warnings.push(warningMsg);
    }
    return false;
  }
}

// 1. Verifica file API client
const apiClientExists = fs.existsSync('../client/src/lib/api-client.ts');
check(
  'Verifica esistenza API client robusto',
  apiClientExists,
  'File api-client.ts non trovato - necessario per gestire errori Netsons'
);

// 2. Verifica configurazione base path
const viteConfigExists = fs.existsSync('../vite.config.ts');
let viteConfigOk = false;
if (viteConfigExists) {
  const viteConfig = fs.readFileSync('../vite.config.ts', 'utf8');
  viteConfigOk = viteConfig.includes('BASE_URL') || viteConfig.includes('base:');
}
check(
  'Verifica configurazione base path in vite.config.ts',
  viteConfigOk,
  null,
  'Assicurati che VITE_BASE_PATH="/wedgallery/" sia impostato durante la build'
);

// 3. Verifica package.json
const packageJsonExists = fs.existsSync('../package.json');
let buildScriptOk = false;
if (packageJsonExists) {
  const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'));
  buildScriptOk = packageJson.scripts && packageJson.scripts.build;
}
check(
  'Verifica script di build in package.json',
  buildScriptOk,
  'Script di build non trovato in package.json'
);

// 4. Verifica InteractionPanel aggiornato
const interactionPanelExists = fs.existsSync('../client/src/components/InteractionPanel.tsx');
let interactionPanelOk = false;
if (interactionPanelExists) {
  const content = fs.readFileSync('../client/src/components/InteractionPanel.tsx', 'utf8');
  interactionPanelOk = content.includes('apiClient');
}
check(
  'Verifica InteractionPanel usa nuovo API client',
  interactionPanelOk,
  'InteractionPanel non aggiornato per usare api-client robusto'
);

// 5. Verifica VoiceMemoUpload aggiornato
const voiceMemoExists = fs.existsSync('../client/src/components/VoiceMemoUpload.tsx');
let voiceMemoOk = false;
if (voiceMemoExists) {
  const content = fs.readFileSync('../client/src/components/VoiceMemoUpload.tsx', 'utf8');
  voiceMemoOk = content.includes('api-client');
}
check(
  'Verifica VoiceMemoUpload usa nuovo API client',
  voiceMemoOk,
  'VoiceMemoUpload non aggiornato per usare api-client robusto'
);

// 6. Verifica basePath.ts
const basePathExists = fs.existsSync('../client/src/lib/basePath.ts');
let basePathOk = false;
if (basePathExists) {
  const content = fs.readFileSync('../client/src/lib/basePath.ts', 'utf8');
  // Verifica che non ci sia logica di auto-rilevamento pericolosa
  const hasAutoDetection = content.includes('window.location.pathname') || 
                          content.includes('segments.split') ||
                          content.includes('appRoutes.includes');
  basePathOk = content.includes('BASE_URL') && !hasAutoDetection;
}
check(
  'Verifica basePath.ts non usa rilevamento automatico',
  basePathOk,
  'basePath.ts contiene ancora logica di auto-rilevamento che causa duplicazioni'
);

// 7. Verifica documentazione aggiornata
const replitMdExists = fs.existsSync('../replit.md');
let docOk = false;
if (replitMdExists) {
  const content = fs.readFileSync('../replit.md', 'utf8');
  docOk = content.includes('SOLUZIONE DEFINITIVA HOSTING NETSONS');
}
check(
  'Verifica documentazione aggiornata',
  docOk,
  null,
  'Documentazione non aggiornata con le ultime modifiche'
);

// 8. Verifica script di test
const testScriptsExist = fs.existsSync('./test-url-duplications.cjs') && 
                        fs.existsSync('./test-api-paths.cjs');
check(
  'Verifica script di test disponibili',
  testScriptsExist,
  null,
  'Script di test non disponibili per validazione'
);

// Riepilogo
console.log('\n📊 RIEPILOGO VERIFICA');
console.log('=====================');
console.log(`✅ Check completati: ${checks}`);
console.log(`❌ Errori: ${errors.length}`);
console.log(`⚠️  Warning: ${warnings.length}\n`);

if (errors.length > 0) {
  console.log('❌ ERRORI DA RISOLVERE:');
  errors.forEach((error, i) => {
    console.log(`   ${i + 1}. ${error}`);
  });
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  WARNING DA CONSIDERARE:');
  warnings.forEach((warning, i) => {
    console.log(`   ${i + 1}. ${warning}`);
  });
  console.log('');
}

if (errors.length === 0) {
  console.log('🚀 PRONTO PER BUILD!');
  console.log('Comando: VITE_BASE_PATH="/wedgallery/" npm run build');
} else {
  console.log('🔧 RISOLVI GLI ERRORI PRIMA DELLA BUILD');
  process.exit(1);
}