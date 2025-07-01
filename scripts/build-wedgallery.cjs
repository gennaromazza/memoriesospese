#!/usr/bin/env node

/**
 * Build rapido per sottocartella /wedgallery/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function buildForWedgallery() {
  log('🏗️ Build per sottocartella /wedgallery/', 'blue');
  
  try {
    // Build con base path corretto
    process.env.VITE_BASE_PATH = '/wedgallery/';
    process.env.NODE_ENV = 'production';
    
    log('📦 Avvio build con VITE_BASE_PATH=/wedgallery/', 'yellow');
    
    // Solo build del client per ora
    execSync('npx vite build', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    log('✅ Build completata', 'green');
    
    // Verifica che i percorsi siano corretti
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf8');
      
      if (content.includes('/wedgallery/assets/')) {
        log('✅ Percorsi configurati correttamente per /wedgallery/', 'green');
      } else {
        log('⚠️ Percorsi potrebbero non essere corretti', 'yellow');
      }
    }
    
    // Crea .htaccess per sottocartella
    createWedgalleryHtaccess();
    
    log('\n📦 Istruzioni deployment:', 'blue');
    log('1. Carica il contenuto di dist/ nella cartella wedgallery/ del tuo hosting', 'reset');
    log('2. URL finale: https://gennaromazzacane.it/wedgallery/', 'reset');
    log('3. Il file .htaccess è già configurato per la sottocartella', 'reset');
    
  } catch (error) {
    log(`❌ Errore durante build: ${error.message}`, 'red');
    process.exit(1);
  }
}

function createWedgalleryHtaccess() {
  const distPath = path.join(__dirname, '..', 'dist');
  const htaccessPath = path.join(distPath, '.htaccess');
  
  const htaccessContent = `# Wedding Gallery - Configurazione per sottocartella /wedgallery/
RewriteEngine On

# Base per sottocartella
RewriteBase /wedgallery/

# Gestione SPA - tutti i route vanno a index.html
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /wedgallery/index.html [L]

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
  log('✅ File .htaccess creato per sottocartella /wedgallery/', 'green');
}

// Esegui se chiamato direttamente
if (require.main === module) {
  buildForWedgallery();
}

module.exports = { buildForWedgallery };