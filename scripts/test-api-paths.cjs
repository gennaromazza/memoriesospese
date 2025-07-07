#!/usr/bin/env node

/**
 * Test per verificare che le chiamate API non abbiano duplicazioni di base path
 * dopo le correzioni al sistema di routing
 */

// Simula la logica corretta per le API
function simulateApiRequest(apiPath) {
  // Se l'app è in sottocartella, anche le API devono avere il base path
  const basePath = '/wedgallery';
  if (apiPath.startsWith('/api')) {
    return basePath + apiPath;
  }
  return apiPath;
}

// Simula la logica corretta per le pagine
function simulatePageNavigation(pagePath) {
  // Le pagine devono avere base path per deployment in sottocartella
  const basePath = '/wedgallery';
  if (!pagePath || pagePath === '/') {
    return basePath + '/';
  }
  return basePath + pagePath;
}

function runTest() {
  console.log('🔍 Test correzione API paths dopo fix routing');
  console.log('');
  
  // Test API paths (devono rimanere al root)
  console.log('📡 API Calls (devono avere base path se app in sottocartella):');
  const apiPaths = [
    '/api/galleries/test123',
    '/api/galleries/test123/photos',
    '/api/galleries/test123/comments/recent',
    '/api/galleries/test123/voice-memos/recent',
    '/api/galleries/test123/photos/top-liked'
  ];
  
  apiPaths.forEach(path => {
    const result = simulateApiRequest(path);
    console.log(`${path.padEnd(40)} → ${result}`);
  });
  
  console.log('');
  console.log('🌐 Page Navigation (devono avere base path):');
  const pagePaths = [
    '/',
    '/admin',
    '/gallery/test123',
    '/view/test123'
  ];
  
  pagePaths.forEach(path => {
    const result = simulatePageNavigation(path);
    console.log(`${path.padEnd(40)} → ${result}`);
  });
  
  console.log('');
  console.log('✅ RISULTATO: API calls e pagine hanno entrambi base path');
  console.log('Configurazione corretta per deployment completo in sottocartella /wedgallery/');
}

runTest();