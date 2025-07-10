#!/usr/bin/env node

/**
 * Script per testare se tutti gli import sono risolti correttamente
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔍 Testing import resolution...');

// Test 1: Check if all UI components exist
const uiComponentsPath = 'client/src/components/ui';
const requiredComponents = ['card.tsx', 'button.tsx', 'input.tsx', 'toast.tsx'];

console.log('\n📦 Checking UI components...');
requiredComponents.forEach(component => {
  const componentPath = path.join(uiComponentsPath, component);
  if (fs.existsSync(componentPath)) {
    console.log(`✅ ${component} exists`);
  } else {
    console.log(`❌ ${component} missing`);
  }
});

// Test 2: Check Vite build process
console.log('\n🔨 Testing Vite build...');
try {
  execSync('cd client && npx vite build --mode development', { stdio: 'inherit' });
  console.log('✅ Vite build successful');
} catch (error) {
  console.log('❌ Vite build failed:', error.message);
}

// Test 3: Check TypeScript compilation
console.log('\n🔍 Testing TypeScript compilation...');
try {
  execSync('npx tsc --noEmit', { stdio: 'inherit' });
  console.log('✅ TypeScript compilation successful');
} catch (error) {
  console.log('❌ TypeScript compilation failed:', error.message);
}

console.log('\n🎯 Import resolution test completed');