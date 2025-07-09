// Deployment check script

/**
 * Script di verifica deployment
 * Controlla che tutti i requisiti per il deployment siano soddisfatti
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkBuildStructure() {
  log('🔍 Verifica struttura build...', 'blue');
  
  const distDir = path.join(rootDir, 'dist');
  const publicDir = path.join(distDir, 'public');
  const serverFile = path.join(distDir, 'index.js');
  
  const requiredPaths = [
    { path: distDir, name: 'dist/', required: true },
    { path: publicDir, name: 'dist/public/', required: true },
    { path: path.join(publicDir, 'index.html'), name: 'dist/public/index.html', required: true },
    { path: path.join(publicDir, 'assets'), name: 'dist/public/assets/', required: true },
    { path: serverFile, name: 'dist/index.js', required: true }
  ];
  
  let issues = [];
  
  for (const item of requiredPaths) {
    if (fs.existsSync(item.path)) {
      log(`✅ ${item.name}`, 'green');
    } else {
      log(`❌ ${item.name} - MANCANTE`, 'red');
      if (item.required) {
        issues.push(`File/directory mancante: ${item.name}`);
      }
    }
  }
  
  return issues;
}

function checkEnvironmentVariables() {
  log('\n🔍 Verifica variabili d\'ambiente...', 'blue');
  
  const requiredVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN', 
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
  ];
  
  const optionalVars = [
    'VITE_ADMIN_PASSWORD',
    'VITE_BASE_PATH',
    'DATABASE_URL'
  ];
  
  let issues = [];
  
  log('Variabili richieste:', 'yellow');
  for (const envVar of requiredVars) {
    if (process.env[envVar]) {
      log(`✅ ${envVar}`, 'green');
    } else {
      log(`❌ ${envVar} - MANCANTE`, 'red');
      issues.push(`Variabile d'ambiente mancante: ${envVar}`);
    }
  }
  
  log('\nVariabili opzionali:', 'yellow');
  for (const envVar of optionalVars) {
    if (process.env[envVar]) {
      log(`✅ ${envVar}`, 'green');
    } else {
      log(`⚠️  ${envVar} - non impostata`, 'yellow');
    }
  }
  
  return issues;
}

function checkPortConfiguration() {
  log('\n🔍 Verifica configurazione porta...', 'blue');
  
  const serverFile = path.join(rootDir, 'dist', 'index.js');
  let issues = [];
  
  if (fs.existsSync(serverFile)) {
    const serverContent = fs.readFileSync(serverFile, 'utf8');
    
    // Verifica che il server usi porta 5000
    if (serverContent.includes('port = 5000') || serverContent.includes('port=5000')) {
      log('✅ Server configurato per porta 5000', 'green');
    } else if (serverContent.includes('5000')) {
      log('✅ Porta 5000 trovata nel codice server', 'green');
    } else {
      log('⚠️  Porta 5000 non chiaramente configurata', 'yellow');
      issues.push('Configurazione porta 5000 da verificare manualmente');
    }
    
    // Verifica host binding
    if (serverContent.includes('0.0.0.0')) {
      log('✅ Server configurato per host 0.0.0.0', 'green');
    } else {
      log('⚠️  Host binding non chiaramente configurato', 'yellow');
    }
  } else {
    log('❌ File server non trovato per verifica porta', 'red');
    issues.push('File server mancante');
  }
  
  return issues;
}

function checkStaticFileServing() {
  log('\n🔍 Verifica serving file statici...', 'blue');
  
  const publicDir = path.join(rootDir, 'dist', 'public');
  let issues = [];
  
  if (!fs.existsSync(publicDir)) {
    log('❌ Directory public mancante', 'red');
    issues.push('Directory dist/public/ mancante - i file statici non saranno serviti');
    return issues;
  }
  
  // Controlla file essenziali
  const essentialFiles = ['index.html', 'assets'];
  for (const file of essentialFiles) {
    const filePath = path.join(publicDir, file);
    if (fs.existsSync(filePath)) {
      log(`✅ ${file} presente`, 'green');
    } else {
      log(`❌ ${file} mancante`, 'red');
      issues.push(`File essenziale mancante: ${file}`);
    }
  }
  
  // Verifica dimensioni file
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    const stats = fs.statSync(indexPath);
    if (stats.size > 100) {
      log(`✅ index.html sembra valido (${stats.size} bytes)`, 'green');
    } else {
      log(`⚠️  index.html molto piccolo (${stats.size} bytes)`, 'yellow');
    }
  }
  
  return issues;
}

function generateFixCommands(issues) {
  if (issues.length === 0) return;
  
  log('\n🔧 Comandi suggeriti per risolvere i problemi:', 'blue');
  log('=' .repeat(50), 'blue');
  
  if (issues.some(issue => issue.includes('dist/public'))) {
    log('Per risolvere problemi di struttura build:', 'yellow');
    log('  node scripts/production-build.js', 'green');
  }
  
  if (issues.some(issue => issue.includes('Variabile d\'ambiente'))) {
    log('\nPer impostare variabili d\'ambiente:', 'yellow');
    log('  1. Crea file .env dalla copia di .env.example', 'green');
    log('  2. Compila tutte le variabili Firebase richieste', 'green');
  }
  
  if (issues.some(issue => issue.includes('File server'))) {
    log('\nPer ricompilare il server:', 'yellow');
    log('  npm run build', 'green');
  }
  
  log('\nPer test completo:', 'yellow');
  log('  node scripts/check-deployment.js', 'green');
}

function main() {
  log('🚀 Verifica Deployment Wedding Gallery App', 'blue');
  log('=' .repeat(50), 'blue');
  
  let allIssues = [];
  
  // Esegui tutte le verifiche
  allIssues.push(...checkBuildStructure());
  allIssues.push(...checkEnvironmentVariables());
  allIssues.push(...checkPortConfiguration());
  allIssues.push(...checkStaticFileServing());
  
  log('\n📊 RISULTATO VERIFICA', 'blue');
  log('=' .repeat(30), 'blue');
  
  if (allIssues.length === 0) {
    log('🎉 DEPLOYMENT PRONTO!', 'green');
    log('✅ Tutti i controlli superati', 'green');
    log('\n🚀 Puoi procedere con il deployment:', 'blue');
    log('   - Replit: vai a Deployments > Static o Server', 'yellow');
    log('   - Server esterno: carica dist/ e avvia con node dist/index.js', 'yellow');
  } else {
    log(`❌ TROVATI ${allIssues.length} PROBLEMI:`, 'red');
    allIssues.forEach((issue, index) => {
      log(`  ${index + 1}. ${issue}`, 'red');
    });
    
    generateFixCommands(allIssues);
  }
  
  log('\n' + '=' .repeat(50), 'blue');
}

main();