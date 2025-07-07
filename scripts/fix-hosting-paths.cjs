#!/usr/bin/env node

/**
 * Script per correggere i percorsi per hosting esterno
 * Converte percorsi assoluti in relativi per compatibilità hosting
 */

const fs = require('fs');
const path = require('path');

function log(message, color = 'reset') {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function fixHostingPaths() {
  const distPath = path.join(__dirname, '..', 'dist');
  const indexPath = path.join(distPath, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    log('❌ File dist/index.html non trovato. Esegui prima npm run build', 'red');
    process.exit(1);
  }
  
  log('🔧 Correzione percorsi per hosting esterno...', 'blue');
  
  // Leggi index.html
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  
  // Sostituisci percorsi assoluti con relativi
  const replacements = [
    // CSS e JS assets
    { from: /href="\/assets\//g, to: 'href="./assets/' },
    { from: /src="\/assets\//g, to: 'src="./assets/' },
    
    // Favicon
    { from: /href="\/favicon\.png"/g, to: 'href="./favicon.png"' },
    
    // Open Graph images
    { from: /content="\/assets\//g, to: 'content="./assets/' },
    
    // Qualsiasi altro percorso assoluto
    { from: /"\/assets\//g, to: '"./assets/' },
    { from: /"\/favicon/g, to: '"./favicon' }
  ];
  
  let changesCount = 0;
  replacements.forEach(({ from, to }) => {
    const matches = indexContent.match(from);
    if (matches) {
      indexContent = indexContent.replace(from, to);
      changesCount += matches.length;
    }
  });
  
  // Scrivi il file aggiornato
  fs.writeFileSync(indexPath, indexContent, 'utf8');
  
  log(`✅ Percorsi corretti: ${changesCount} sostituzioni`, 'green');
  log('📁 File aggiornato: dist/index.html', 'green');
  
  // Verifica che il server sia configurato
  const serverIndexPath = path.join(distPath, 'index.js');
  if (!fs.existsSync(serverIndexPath)) {
    log('⚠️ File server dist/index.js non trovato', 'yellow');
    log('💡 Per il solo frontend, carica solo il contenuto di dist/', 'blue');
  }
  
  log('\n📦 Istruzioni deployment:', 'blue');
  log('1. Carica il contenuto della cartella dist/ nel tuo hosting', 'reset');
  log('2. Assicurati che index.html sia servito come default', 'reset');
  log('3. Configura il server per servire tutti i route su index.html (SPA)', 'reset');
  
  return true;
}

function createHtaccess() {
  const distPath = path.join(__dirname, '..', 'dist');
  const htaccessPath = path.join(distPath, '.htaccess');
  
  const htaccessContent = `# Wedding Gallery - Configurazione Apache
RewriteEngine On

# Gestione SPA - tutti i route vanno a index.html
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

# Cache per assets statici
<IfModule mod_expires.c>
    ExpiresActive on
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/jpg "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
</IfModule>

# Compressione GZIP
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE text/xml
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE application/xml
    AddOutputFilterByType DEFLATE application/xhtml+xml
    AddOutputFilterByType DEFLATE application/rss+xml
    AddOutputFilterByType DEFLATE application/javascript
    AddOutputFilterByType DEFLATE application/x-javascript
</IfModule>`;

  fs.writeFileSync(htaccessPath, htaccessContent, 'utf8');
  log('✅ File .htaccess creato per Apache', 'green');
}

// Esegui se chiamato direttamente
if (require.main === module) {
  fixHostingPaths();
  createHtaccess();
}

module.exports = { fixHostingPaths, createHtaccess };