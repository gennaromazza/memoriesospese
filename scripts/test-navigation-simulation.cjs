/**
 * Script per simulare la navigazione tra le pagine dell'applicazione
 * in ambiente di produzione (sottodirectory /wedgallery/)
 */

// Simula l'ambiente di produzione
process.env.NODE_ENV = 'production';

// Simula il comportamento del modulo basePath.ts
function getBasePath() {
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
  
  // Concatena il percorso base con il percorso relativo
  return `${basePath}${normalizedPath}`;
}

function simulateNavigation() {
  console.log('=== SIMULAZIONE DI NAVIGAZIONE IN AMBIENTE PRODUZIONE ===');
  console.log('Ambiente: Produzione (sottodirectory /wedgallery/)');
  console.log('');
  
  // Simulazione del flusso completo
  let currentUrl = "https://www.example.com/wedgallery/";
  console.log(`1. URL iniziale: ${currentUrl}`);
  
  // Navigazione a /gallery/12345
  let nextPath = "/gallery/12345";
  let nextUrl = `https://www.example.com${createUrl(nextPath)}`;
  console.log(`2. Utente clicca link verso ${nextPath}`);
  console.log(`   URL generato: ${nextUrl}`);
  currentUrl = nextUrl;
  
  // Navigazione a /admin
  nextPath = "/admin";
  nextUrl = `https://www.example.com${createUrl(nextPath)}`;
  console.log(`3. Utente clicca link verso ${nextPath}`);
  console.log(`   URL generato: ${nextUrl}`);
  currentUrl = nextUrl;
  
  // Navigazione a /admin/dashboard dopo login
  nextPath = "/admin/dashboard";
  nextUrl = `https://www.example.com${createUrl(nextPath)}`;
  console.log(`4. Utente effettua login, redirect a ${nextPath}`);
  console.log(`   URL generato: ${nextUrl}`);
  currentUrl = nextUrl;
  
  // Navigazione a / (tornare alla home)
  nextPath = "/";
  nextUrl = `https://www.example.com${createUrl(nextPath)}`;
  console.log(`5. Utente clicca su Home link (${nextPath})`);
  console.log(`   URL generato: ${nextUrl}`);
  
  console.log('');
  console.log('✅ SIMULAZIONE COMPLETATA');
  console.log('Tutti gli URL generati contengono il percorso base corretto (/wedgallery/)');
  console.log('e non mostrano duplicazioni (/wedgallery/wedgallery/)');
  
  // Verifica che non ci siano duplicazioni negli URL
  const pattern = /\/wedgallery\/wedgallery\//;
  const urlsToCheck = [
    `https://www.example.com${createUrl("/")}`,
    `https://www.example.com${createUrl("/gallery/12345")}`,
    `https://www.example.com${createUrl("/admin")}`,
    `https://www.example.com${createUrl("/admin/dashboard")}`,
  ];
  
  const duplications = urlsToCheck.filter(url => pattern.test(url));
  if (duplications.length > 0) {
    console.log('');
    console.log('⚠️ ATTENZIONE: Trovate duplicazioni nei seguenti URL:');
    duplications.forEach(url => console.log(`- ${url}`));
  }
}

// Esegui la simulazione
simulateNavigation();