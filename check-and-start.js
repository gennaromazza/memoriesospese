
#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';

const distFile = 'dist/index.js';

console.log('🔍 Verificando presenza del file compilato...');

if (!fs.existsSync(distFile)) {
  console.log('❌ File dist/index.js non trovato. Avvio build...');
  try {
    execSync('npm run build:server', { stdio: 'inherit' });
    console.log('✅ Build completata!');
  } catch (error) {
    console.error('❌ Errore durante la build:', error.message);
    process.exit(1);
  }
}

if (fs.existsSync(distFile)) {
  console.log('✅ File dist/index.js trovato. Avvio server...');
  try {
    execSync('node dist/index.js', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Errore durante l\'avvio del server:', error.message);
    process.exit(1);
  }
} else {
  console.error('❌ Impossibile trovare o creare dist/index.js');
  process.exit(1);
}
