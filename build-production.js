#!/usr/bin/env node

/**
 * Production build script for Firebase-Only SPA
 * Builds the client and server for production deployment
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

async function buildProduction() {
  console.log('🔥 Starting production build for Firebase-Only SPA...');
  
  try {
    // Step 1: Build client (static files)
    console.log('📦 Building client...');
    await execAsync('npm run build:client');
    console.log('✅ Client built successfully');
    
    // Step 2: Build production server
    console.log('🚀 Building production server...');
    await execAsync('npx esbuild server/production.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/index.js --minify');
    console.log('✅ Production server built successfully');
    
    // Step 3: Verify build output
    const distPath = path.resolve(process.cwd(), 'dist');
    const indexJsPath = path.join(distPath, 'index.js');
    const indexHtmlPath = path.join(distPath, 'index.html');
    
    if (!fs.existsSync(indexJsPath)) {
      throw new Error('dist/index.js not found after build');
    }
    
    if (!fs.existsSync(indexHtmlPath)) {
      throw new Error('dist/index.html not found after build');
    }
    
    console.log('✅ Production build complete!');
    console.log(`📁 Built files: ${distPath}`);
    console.log(`🚀 Server: ${indexJsPath}`);
    console.log(`🌐 Client: ${indexHtmlPath}`);
    console.log('🎯 Ready for production deployment');
    
  } catch (error) {
    console.error('❌ Production build failed:', error.message);
    process.exit(1);
  }
}

buildProduction();