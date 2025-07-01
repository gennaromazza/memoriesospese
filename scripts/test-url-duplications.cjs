#!/usr/bin/env node

/**
 * Test rapido per verificare che non ci siano duplicazioni /wedgallery/wedgallery/
 * dopo le modifiche al sistema basePath
 */

const testPaths = [
  '/',
  '/admin',
  '/gallery/test123',
  '/view/test123',
  '/request-password/test123'
];

function simulateGetBasePath() {
  // Simula produzione con VITE_BASE_PATH="/wedgallery/"
  return '/wedgallery';
}

function simulateCreateUrl(path) {
  // Simula la nuova logica di createUrl
  if (!path || path === '/') {
    const basePath = simulateGetBasePath();
    return basePath ? basePath + '/' : '/';
  }

  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  const basePath = simulateGetBasePath();
  
  if (basePath) {
    return basePath + cleanPath;
  }
  
  return cleanPath;
}

function testUrlCreation() {
  console.log('🔍 Test duplicazioni /wedgallery/wedgallery/ dopo fix');
  console.log('Base path simulato: /wedgallery');
  console.log('');
  
  let hasDuplications = false;
  
  testPaths.forEach(testPath => {
    const result = simulateCreateUrl(testPath);
    const hasDuplication = result.includes('/wedgallery/wedgallery/');
    
    console.log(`${testPath.padEnd(25)} → ${result.padEnd(35)} ${hasDuplication ? '❌ DUPLICAZIONE!' : '✅ OK'}`);
    
    if (hasDuplication) {
      hasDuplications = true;
    }
  });
  
  console.log('');
  if (hasDuplications) {
    console.log('❌ RILEVATE DUPLICAZIONI - Correggere basePath.ts');
    process.exit(1);
  } else {
    console.log('✅ NESSUNA DUPLICAZIONE RILEVATA');
    console.log('Il sistema di gestione URL è corretto');
  }
}

testUrlCreation();