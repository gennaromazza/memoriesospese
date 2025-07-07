/**
 * Script per configurare l'applicazione per il deployment
 * Supporta sia installazione root che in sottocartella
 * 
 * Utilizzo:
 * node scripts/configure-deployment.js --mode=[root|subdirectory]
 */

const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '../client/src/config.ts');
const htaccessPath = path.join(__dirname, '../client/public/.htaccess');
const htaccessRootPath = path.join(__dirname, '../client/public/.htaccess.root');
const htaccessSubdirPath = path.join(__dirname, '../client/public/.htaccess.subdirectory');

// Analizza gli argomenti della riga di comando
const args = process.argv.slice(2);
const modeArg = args.find(arg => arg.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : null;

if (!mode || (mode !== 'root' && mode !== 'subdirectory')) {
  console.error('Modalità di deployment non valida. Utilizzo:');
  console.error('node scripts/configure-deployment.js --mode=[root|subdirectory]');
  process.exit(1);
}

console.log(`Configurazione dell'applicazione per deployment in modalità: ${mode}`);

// 1. Aggiorna il file di configurazione
const basePath = mode === 'root' ? '/' : '/wedgallery/';
const configContent = `/**
 * Configurazione per l'applicazione
 * Configurato per ${mode === 'root' ? 'installazione a livello root' : 'sottocartella /wedgallery/'}
 */

// Percorso base dell'applicazione in produzione
export const PRODUCTION_BASE_PATH = '${basePath}';
`;

fs.writeFileSync(configPath, configContent);
console.log(`✅ Aggiornato file di configurazione con basePath = '${basePath}'`);

// 2. Copia il file .htaccess appropriato
const sourceHtaccess = mode === 'root' ? htaccessRootPath : htaccessSubdirPath;
fs.copyFileSync(sourceHtaccess, htaccessPath);
console.log(`✅ Copiato file .htaccess per modalità ${mode}`);

// 3. Suggerimenti finali
console.log('\nConfigurazione completata!');
console.log('Esegui il build dell\'applicazione con:');
console.log('npm run build');

if (mode === 'subdirectory') {
  console.log('\nPer installazione in sottocartella:');
  console.log('1. Carica tutti i file dalla cartella dist/ nella sottocartella /wedgallery/ del tuo server web');
  console.log('2. Assicurati che il file .htaccess sia presente nella sottocartella');
} else {
  console.log('\nPer installazione a livello root:');
  console.log('1. Carica tutti i file dalla cartella dist/ nella cartella principale del tuo server web');
  console.log('2. Assicurati che il file .htaccess sia presente nella cartella principale');
}