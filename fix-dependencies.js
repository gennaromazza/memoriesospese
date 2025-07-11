import fs from 'fs';
import { execSync } from 'child_process';

console.log('🔧 Fixing deployment dependencies...');

// Read package.json
const packageJsonPath = './package.json';
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Remove invalid packages
const invalidPackages = [
  '@radix-ui/react-sheet',
  '@radix-ui/react-textarea'
];

console.log('📋 Removing invalid packages from package.json...');
invalidPackages.forEach(pkg => {
  if (packageJson.dependencies[pkg]) {
    delete packageJson.dependencies[pkg];
    console.log(`   ✓ Removed ${pkg}`);
  }
});

// Write updated package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log('✅ Updated package.json');

// Clean install
console.log('🧹 Cleaning node_modules and package-lock.json...');
try {
  execSync('rm -rf node_modules package-lock.json', { stdio: 'inherit' });
} catch (error) {
  console.log('⚠️  No files to clean');
}

console.log('📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed successfully');
} catch (error) {
  console.error('❌ Error installing dependencies:', error.message);
  process.exit(1);
}

console.log('🎉 Deployment dependencies fixed!');