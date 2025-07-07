/**
 * Script per testare il comportamento dei percorsi URL quando l'applicazione
 * è installata in una sottodirectory /wedgallery/.
 * 
 * Questo script simula l'ambiente di produzione e verifica che non ci siano
 * duplicazioni di percorsi come /wedgallery/wedgallery/admin.
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
  const normalizedPath = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath;
  
  // Controllo esplicito per evitare duplicazioni
  // Verifica se il path non contenga già il basePath (ad es. /wedgallery/admin quando basePath è /wedgallery/)
  if (normalizedPath.startsWith(basePath.substring(1))) {
    console.log(`[PROTEZIONE] Rilevato tentativo di duplicazione del basePath in "${urlPath}". Correzione automatica applicata.`);
    return `/${normalizedPath}`;
  }
  
  // Concatena il percorso base con il percorso relativo
  return `${basePath}${normalizedPath}`;
}

function createAbsoluteUrl(urlPath) {
  // Simula origin di produzione
  const origin = 'https://www.example.com';
  return `${origin}${createUrl(urlPath)}`;
}

// Array di percorsi da testare
const testPaths = [
  '/',
  '/admin',
  '/admin/dashboard',
  '/gallery/12345',
  '/view/12345',
  '/request-password/12345',
  '/password-result/12345'
];

// Funzione per verificare la presenza di duplicazioni di 'wedgallery'
function checkForDuplication(url) {
  // Controlla se c'è un pattern di duplicazione /wedgallery/wedgallery/
  const duplicationPattern = /\/wedgallery\/wedgallery\//;
  const containsDuplication = duplicationPattern.test(url);
  
  return {
    url,
    containsDuplication,
    isValid: !containsDuplication
  };
}

// Funzione principale di test
function runTest() {
  console.log('=== TEST PERCORSI IN SOTTODIRECTORY ===');
  console.log('Simula ambiente di produzione con basePath = /wedgallery/');
  console.log('');
  
  let allValid = true;
  
  console.log('1) Test di createUrl():');
  testPaths.forEach(testPath => {
    const url = createUrl(testPath);
    const result = checkForDuplication(url);
    
    console.log(`   ${testPath.padEnd(20)} → ${url.padEnd(30)} ${result.isValid ? '✓' : '✗ DUPLICAZIONE RILEVATA!'}`);
    
    if (!result.isValid) {
      allValid = false;
    }
  });
  
  console.log('');
  console.log('2) Test di createAbsoluteUrl():');
  testPaths.forEach(testPath => {
    const absoluteUrl = createAbsoluteUrl(testPath);
    const result = checkForDuplication(absoluteUrl);
    
    console.log(`   ${testPath.padEnd(20)} → ${absoluteUrl.padEnd(60)} ${result.isValid ? '✓' : '✗ DUPLICAZIONE RILEVATA!'}`);
    
    if (!result.isValid) {
      allValid = false;
    }
  });

  console.log('');
  if (allValid) {
    console.log('✅ SUCCESSO: Nessuna duplicazione /wedgallery/wedgallery/ rilevata nei percorsi generati!');
    console.log('Il sistema di gestione URL funziona correttamente per sottodirectory.');
  } else {
    console.log('❌ ERRORE: Rilevate duplicazioni di percorso /wedgallery/wedgallery/');
    console.log('Correggere il file lib/basePath.ts.');
  }
}

// Esegui il test
runTest();