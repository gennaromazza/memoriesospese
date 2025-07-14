#!/usr/bin/env node

/**
 * Build script per Firebase-Only SPA
 * Genera struttura corretta per deployment
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
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
  };
  console.log(colors[color] + message + colors.reset);
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log(`✅ Created directory: ${dirPath}`, 'green');
  }
}

function cleanBuild() {
  log('🧹 Cleaning previous build...', 'yellow');
  try {
    if (fs.existsSync(path.join(rootDir, 'dist'))) {
      fs.rmSync(path.join(rootDir, 'dist'), { recursive: true, force: true });
    }
    log('✅ Build cleaned', 'green');
  } catch (error) {
    log('⚠️  No previous build to clean', 'yellow');
  }
}

function buildClient() {
  log('🏗️  Building client (Vite)...', 'blue');
  try {
    process.chdir(rootDir);
    execSync('vite build', { stdio: 'inherit' });
    log('✅ Client built successfully', 'green');
  } catch (error) {
    log('❌ Client build failed', 'red');
    console.error(error);
    throw error;
  }
}

function buildSimpleServer() {
  log('🏗️  Building simple server for deployment...', 'blue');
  try {
    process.chdir(rootDir);
    execSync('tsc server/production.ts --outDir dist --module es2022 --moduleResolution node --target es2022', { stdio: 'inherit' });
    log('✅ Server built successfully', 'green');
  } catch (error) {
    log('❌ Server build failed', 'red');
    console.error(error);
    throw error;
  }
}

function createFallbackServer() {
  log('🔧 Creating fallback server...', 'blue');
  
  const serverContent = `/**
 * Simple production server for Firebase-Only SPA
 * Serves static files built by Vite
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

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
});`;

  const distPath = path.join(rootDir, 'dist');
  ensureDirectoryExists(distPath);
  
  fs.writeFileSync(path.join(distPath, 'index.js'), serverContent);
  log('✅ Fallback server created', 'green');
}

function validateBuild() {
  log('🔍 Validating build...', 'blue');
  
  const distPath = path.join(rootDir, 'dist');
  const requiredFiles = [
    'index.html',
    'index.js',
    'assets'
  ];
  
  let allValid = true;
  
  for (const file of requiredFiles) {
    const filePath = path.join(distPath, file);
    if (fs.existsSync(filePath)) {
      log(`✅ ${file}`, 'green');
    } else {
      log(`❌ ${file} - MISSING`, 'red');
      allValid = false;
    }
  }
  
  if (allValid) {
    log('✅ Build validation passed', 'green');
  } else {
    log('❌ Build validation failed', 'red');
    throw new Error('Build validation failed');
  }
}

function showDeploymentInfo() {
  log('\n🚀 BUILD COMPLETATO PER FIREBASE-ONLY SPA', 'cyan');
  log('==========================================', 'cyan');
  log('📁 Struttura generata:', 'blue');
  log('  dist/index.html (SPA entry point)', 'green');
  log('  dist/assets/ (CSS/JS/images)', 'green');
  log('  dist/index.js (Simple server fallback)', 'green');
  log('', 'reset');
  log('🌐 Architettura: Firebase-Only SPA', 'blue');
  log('🔥 Database: Firebase Firestore', 'blue');
  log('💾 Storage: Firebase Storage', 'blue');
  log('🔐 Auth: Firebase Authentication', 'blue');
  log('', 'reset');
  log('✅ PRONTO PER DEPLOYMENT!', 'green');
}

async function main() {
  try {
    log('🔥 BUILD FIREBASE-ONLY SPA', 'cyan');
    log('========================', 'cyan');
    
    cleanBuild();
    buildClient();
    createFallbackServer();
    validateBuild();
    showDeploymentInfo();
    
  } catch (error) {
    log('❌ BUILD FAILED', 'red');
    console.error(error);
    process.exit(1);
  }
}

main();