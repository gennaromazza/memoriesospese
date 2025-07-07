/**
 * Script per testare la protezione contro duplicazioni di percorsi
 * come /wedgallery/wedgallery/admin
 */

// Simula l'ambiente di produzione
process.env.NODE_ENV = 'production';

// Simula il comportamento del modulo basePath.ts
function getBasePath() {
  // Forza ambiente di produzione per questo test
  return '/wedgallery/';
}

function createUrl(urlPath) {
  const basePath = getBasePath();
  
  // Gestione percorsi speciali
  if (urlPath === '' || urlPath === '/') {
    return basePath;
  }
  
  // Rimuovi slash iniziale dal path se presente
  const normalizedPath = urlPath.startsWith('/') ? urlPath.substring(1) : path;
  
  // Controllo esplicito per evitare duplicazioni
  // Verifica se il path non contenga già il basePath (ad es. /wedgallery/admin quando basePath è /wedgallery/)
  if (normalizedPath.startsWith(basePath.substring(1))) {
    console.log(`[PROTEZIONE] Rilevato tentativo di duplicazione del basePath in "${urlPath}". Correzione automatica applicata.`);
    return `/${normalizedPath}`;
  }
  
  // Concatena il percorso base con il percorso relativo
  return `${basePath}${normalizedPath}`;
}

// Casi di test specifici per testare la protezione contro le duplicazioni
const duplicateTestCases = [
  // Casi problematici che potrebbero causare duplicazioni
  '/wedgallery/admin',
  '/wedgallery/gallery/12345',
  '/wedgallery/wedgallery/admin', // Doppia duplicazione
  'wedgallery/admin', // Senza slash iniziale
  
  // Casi normali che non dovrebbero attivare la protezione
  '/admin',
  '/gallery/12345',
  '/admin/dashboard',
];

console.log('=== TEST PROTEZIONE CONTRO DUPLICAZIONI DI PERCORSI ===');
console.log('Simula ambiente di produzione con basePath = /wedgallery/');
console.log('');

duplicateTestCases.forEach(testCase => {
  const result = createUrl(testCase);
  
  // Controlla se il risultato contiene duplicazioni
  const containsDuplication = result.indexOf('/wedgallery/wedgallery/') > -1;
  
  console.log(`Input: ${testCase.padEnd(30)}`);
  console.log(`Output: ${result.padEnd(30)} ${containsDuplication ? '❌ DUPLICAZIONE!' : '✅ OK'}`);
  console.log('');
});

console.log('Test completato!');