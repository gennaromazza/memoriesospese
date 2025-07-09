
const fs = require('fs');
const path = require('path');

function checkSyntax(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for common syntax issues
    const issues = [];
    
    // Check for unmatched brackets
    const openBrackets = (content.match(/\{/g) || []).length;
    const closeBrackets = (content.match(/\}/g) || []).length;
    if (openBrackets !== closeBrackets) {
      issues.push(`Unmatched brackets: ${openBrackets} open, ${closeBrackets} close`);
    }
    
    // Check for unmatched quotes
    const singleQuotes = (content.match(/'/g) || []).length;
    const doubleQuotes = (content.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0) {
      issues.push(`Unmatched single quotes`);
    }
    if (doubleQuotes % 2 !== 0) {
      issues.push(`Unmatched double quotes`);
    }
    
    if (issues.length > 0) {
      console.log(`❌ Issues in ${filePath}:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log(`✅ ${filePath} looks good`);
    }
    
  } catch (error) {
    console.log(`❌ Error reading ${filePath}:`, error.message);
  }
}

// Check main files
const filesToCheck = [
  'server/index.ts',
  'server/vite.ts',
  'server/routes.ts',
  'client/src/main.tsx',
  'client/src/App.tsx'
];

console.log('🔍 Checking syntax in key files...\n');

filesToCheck.forEach(file => {
  if (fs.existsSync(file)) {
    checkSyntax(file);
  } else {
    console.log(`⚠️  File not found: ${file}`);
  }
});

console.log('\n🏁 Syntax check complete');
