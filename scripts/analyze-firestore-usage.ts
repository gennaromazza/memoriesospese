
/**
 * Script per analizzare l'utilizzo di Firestore nel progetto
 * Estrae collezioni, funzioni, pagine admin, componenti UI, route server
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

interface AnalysisResult {
  firestore_collections: string[];
  firestore_functions: string[];
  admin_pages: string[];
  ui_components: string[];
  server_routes: string[];
  firestore_lib_files: string[];
}

const result: AnalysisResult = {
  firestore_collections: [],
  firestore_functions: [],
  admin_pages: [],
  ui_components: [],
  server_routes: [],
  firestore_lib_files: []
};

// Helper: Leggi file ricorsivamente
function* walkSync(dir: string, filter?: RegExp): Generator<string> {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.name === 'node_modules' || file.name === 'dist') continue;
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      yield* walkSync(fullPath, filter);
    } else if (!filter || filter.test(fullPath)) {
      yield fullPath;
    }
  }
}

// 1) Estrai collezioni Firestore
console.log('→ Estrazione collezioni Firestore...');
const collectionPattern = /collection\s*\(\s*db\s*,\s*['"]([^'"]+)['"]/g;
const collections = new Set<string>();

for (const file of walkSync(projectRoot, /\.(ts|tsx|js)$/)) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = collectionPattern.exec(content)) !== null) {
    collections.add(match[1]);
  }
}
result.firestore_collections = Array.from(collections).sort();

// 2) Estrai funzioni Firestore importate
console.log('→ Estrazione funzioni Firestore...');
const importPattern = /import\s+{([^}]+)}\s+from\s+['"]firebase\/firestore['"]/g;
const functions = new Set<string>();

for (const file of walkSync(projectRoot, /\.(ts|tsx|js)$/)) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = importPattern.exec(content)) !== null) {
    const imports = match[1].split(',').map(s => s.trim()).filter(Boolean);
    imports.forEach(imp => functions.add(imp));
  }
}
result.firestore_functions = Array.from(functions).sort();

// 3) Estrai pagine admin
console.log('→ Estrazione pagine Admin...');
const adminPages: string[] = [];
for (const file of walkSync(path.join(projectRoot, 'client', 'src'))) {
  if (file.toLowerCase().includes('admin')) {
    adminPages.push(path.relative(projectRoot, file));
  }
}
result.admin_pages = adminPages.sort();

// 4) Estrai componenti UI principali
console.log('→ Estrazione componenti UI...');
const componentPattern = /<([A-Z][A-Za-z0-9]*)/g;
const components = new Set<string>();

for (const file of walkSync(path.join(projectRoot, 'client', 'src', 'components'), /\.(tsx|jsx)$/)) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = componentPattern.exec(content)) !== null) {
    components.add(match[1]);
  }
}
result.ui_components = Array.from(components).sort().slice(0, 50); // Limita a 50 più comuni

// 5) Estrai route server
console.log('→ Estrazione route lato server...');
const routePattern = /app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
const routes = new Set<string>();

for (const file of walkSync(path.join(projectRoot, 'server'), /\.(ts|js)$/)) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = routePattern.exec(content)) !== null) {
    routes.add(`${match[1].toUpperCase()} ${match[2]}`);
  }
}
result.server_routes = Array.from(routes).sort();

// 6) Identifica lib files che usano Firestore
console.log('→ Identificazione lib/*.ts Firestore...');
const libPath = path.join(projectRoot, 'client', 'src', 'lib');
if (fs.existsSync(libPath)) {
  for (const file of walkSync(libPath, /\.ts$/)) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('firebase/firestore')) {
      result.firestore_lib_files.push(path.relative(projectRoot, file));
    }
  }
}
result.firestore_lib_files.sort();

// Salva risultato
const outputPath = path.join(projectRoot, 'firestore_analysis.json');
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

console.log('\n✅ Analisi completata!');
console.log(`📄 File generato: ${outputPath}`);
console.log(`\n📊 Riepilogo:`);
console.log(`   - Collezioni Firestore: ${result.firestore_collections.length}`);
console.log(`   - Funzioni Firestore: ${result.firestore_functions.length}`);
console.log(`   - Pagine Admin: ${result.admin_pages.length}`);
console.log(`   - Componenti UI: ${result.ui_components.length}`);
console.log(`   - Route Server: ${result.server_routes.length}`);
console.log(`   - File Lib Firestore: ${result.firestore_lib_files.length}`);
