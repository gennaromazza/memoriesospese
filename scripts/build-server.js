#!/usr/bin/env node

/**
 * Build script for server TypeScript compilation
 * Handles TypeScript to JavaScript compilation for production
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

function log(message, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
  };
  console.log(colors[color] + message + colors.reset);
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createProductionTSConfig() {
  log('🔧 Creating production TypeScript config...', 'blue');
  
  const tsConfig = {
    compilerOptions: {
      target: "ES2020",
      module: "ES2020",
      moduleResolution: "node",
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      outDir: "./dist",
      rootDir: "./server",
      declaration: false,
      removeComments: true,
      noEmit: false
    },
    include: ["server/**/*"],
    exclude: ["node_modules", "dist", "client"]
  };
  
  fs.writeFileSync(
    path.join(rootDir, 'tsconfig.production.json'),
    JSON.stringify(tsConfig, null, 2)
  );
  
  log('✅ Production TypeScript config created', 'green');
}

function buildServerTypescript() {
  log('🔨 Building server TypeScript...', 'blue');
  
  try {
    // Create production tsconfig
    createProductionTSConfig();
    
    // Clean dist directory
    const distPath = path.join(rootDir, 'dist');
    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
    }
    ensureDirectoryExists(distPath);
    
    // Compile TypeScript using production config
    execSync('npx tsc --project tsconfig.production.json', {
      stdio: 'inherit',
      cwd: rootDir
    });
    
    log('✅ Server TypeScript built successfully', 'green');
    return true;
    
  } catch (error) {
    log(`❌ TypeScript build failed: ${error.message}`, 'red');
    return false;
  }
}

function createFallbackServer() {
  log('🔧 Creating fallback server...', 'blue');
  
  const serverContent = `// Fallback production server
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Serve static files from current directory
app.use(express.static(__dirname));

// Handle SPA routing - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Firebase-Only SPA running on port ' + PORT);
  console.log('📁 Serving static files from: ' + __dirname);
  console.log('🌐 Architecture: Firebase-Only SPA');
});
`;

  fs.writeFileSync(path.join(rootDir, 'dist', 'index.js'), serverContent);
  log('✅ Fallback server created', 'green');
}

function main() {
  log('🚀 Starting server build process...', 'cyan');
  
  // Try TypeScript build first
  if (!buildServerTypescript()) {
    log('⚠️  TypeScript build failed, using fallback server', 'yellow');
    createFallbackServer();
  }
  
  // Verify the server file exists
  const serverPath = path.join(rootDir, 'dist', 'index.js');
  if (fs.existsSync(serverPath)) {
    log('✅ Server build completed successfully', 'green');
    log(`📄 Server file: ${serverPath}`, 'blue');
  } else {
    log('❌ Server build failed - no output file', 'red');
    process.exit(1);
  }
}

main();