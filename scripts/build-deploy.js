
// Build and deployment script

/**
 * Script automatico per build e deployment
 * Configura dinamicamente il base path e prepara l'applicazione
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Colori per output
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

function detectEnvironment() {
  // Rileva se siamo su Replit
  const isReplit = process.env.REPL_ID || process.env.REPLIT_DB_URL;
  
  // Rileva base path dalla URL corrente o da variabili d'ambiente
  let basePath = '/';
  
  if (process.env.VITE_BASE_PATH) {
    basePath = process.env.VITE_BASE_PATH;
  } else if (isReplit) {
    // Su Replit, usa il base path di default
    basePath = '/';
  }
  
  return {
    isReplit,
    basePath,
    environment: process.env.NODE_ENV || 'production'
  };
}

function updateViteConfig(basePath) {
  const viteConfigPath = path.join(rootDir, 'vite.config.ts');
  const content = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? process.env.VITE_BASE_PATH || '${basePath}' : '/',

  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
});
`;
  
  fs.writeFileSync(viteConfigPath, content);
  log(`✅ Aggiornato vite.config.ts con base path: ${basePath}`, 'green');
}

function createEnvFiles(basePath) {
  // Crea/aggiorna .env.production
  const envProdPath = path.join(rootDir, 'client/.env.production');
  const envContent = `VITE_BASE_PATH=${basePath}
`;
  
  fs.writeFileSync(envProdPath, envContent);
  log(`✅ Aggiornato .env.production`, 'green');
}

function createRewriteRules(basePath) {
  const replitPath = path.join(rootDir, '.replit');
  
  // Leggi il file .replit esistente o crea nuovo contenuto
  let replitContent = '';
  if (fs.existsSync(replitPath)) {
    replitContent = fs.readFileSync(replitPath, 'utf8');
  }
  
  // Rimuovi eventuali regole di rewrite esistenti
  replitContent = replitContent.replace(/\[\[deployment\.rewrites\]\][\s\S]*?(?=\n\[|\n$|$)/g, '');
  
  // Aggiungi nuove regole di rewrite
  const rewriteRules = `
[[deployment.rewrites]]
from = "/*"
to = "/index.html"

[[deployment.responseHeaders]]
path = "/*"
name = "Cache-Control"
value = "public, max-age=31536000"

[[deployment.responseHeaders]]
path = "/index.html"
name = "Cache-Control"
value = "no-cache"
`;
  
  replitContent += rewriteRules;
  fs.writeFileSync(replitPath, replitContent);
  log(`✅ Aggiornato .replit con regole di deployment`, 'green');
}

function runBuild() {
  log('🔨 Avvio build di produzione...', 'blue');
  
  try {
    // Imposta variabili d'ambiente per la build
    process.env.NODE_ENV = 'production';
    
    // Esegui la build
    execSync('npm run build', { 
      stdio: 'inherit', 
      cwd: rootDir,
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    log('✅ Build completata con successo!', 'green');
    return true;
  } catch (error) {
    log(`❌ Errore durante la build: ${error.message}`, 'red');
    return false;
  }
}

function createDeploymentInstructions(config) {
  const instructionsPath = path.join(rootDir, 'dist/DEPLOYMENT_INSTRUCTIONS.md');
  const instructions = `# Istruzioni di Deployment

## Configurazione Rilevata
- **Ambiente**: ${config.environment}
- **Base Path**: ${config.basePath}
- **Piattaforma**: ${config.isReplit ? 'Replit' : 'Generico'}

## Deployment su Replit

### Deployment Statico (Raccomandato)
1. Vai alla scheda "Deployments" in Replit
2. Seleziona "Static Deployment"
3. Configura:
   - **Build Command**: \`npm run build\`
   - **Public Directory**: \`dist\`
4. Clicca "Deploy"

### Deployment con Server (Alternativo)
1. Usa il workflow "Start application" per avviare il server
2. Il server servirà automaticamente i file statici da \`dist/\`

## File Generati
- **dist/**: Cartella con tutti i file di produzione
- **dist/index.html**: Pagina principale
- **dist/assets/**: Asset ottimizzati (CSS, JS, immagini)

## Note
- I path sono configurati dinamicamente
- L'applicazione funziona sia a livello root che in sottocartelle
- Le regole di rewrite sono configurate automaticamente

Generato il: ${new Date().toLocaleString('it-IT')}
`;

  fs.writeFileSync(instructionsPath, instructions);
  log(`✅ Istruzioni di deployment create in: ${instructionsPath}`, 'green');
}

// Funzione principale
function main() {
  log('🚀 Avvio build e deployment automatico...', 'blue');
  
  // 1. Rileva configurazione ambiente
  const config = detectEnvironment();
  log(`📍 Configurazione rilevata:`, 'yellow');
  log(`   - Ambiente: ${config.environment}`);
  log(`   - Base Path: ${config.basePath}`);
  log(`   - Piattaforma: ${config.isReplit ? 'Replit' : 'Generico'}`);
  
  // 2. Aggiorna configurazioni
  updateViteConfig(config.basePath);
  createEnvFiles(config.basePath);
  createRewriteRules(config.basePath);
  
  // 3. Esegui build
  const buildSuccess = runBuild();
  
  if (buildSuccess) {
    // 4. Crea istruzioni
    createDeploymentInstructions(config);
    
    log('🎉 Build e configurazione completate!', 'green');
    log('📁 File pronti per deployment in: ./dist/', 'yellow');
    log('📖 Leggi ./dist/DEPLOYMENT_INSTRUCTIONS.md per le istruzioni', 'yellow');
    
    if (config.isReplit) {
      log('💡 Su Replit: vai a Deployments > Static Deployment', 'blue');
    }
  } else {
    log('❌ Build fallita. Controlla gli errori sopra.', 'red');
    process.exit(1);
  }
}

// Esegui script
main();
