/**
 * Script per sostituire window.location.href con navigate() nell'app
 * 
 * Questo script:
 * 1. Cerca tutti i file .tsx e .jsx nella directory client/src
 * 2. Trova le occorrenze di window.location.href
 * 3. Le sostituisce con navigate() usando createUrl quando appropriato
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Ottieni il percorso corrente
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurazione
const srcDir = path.join(__dirname, '..', 'client', 'src');
const fileExtensions = ['.tsx', '.jsx', '.ts', '.js'];
const excludeDirs = ['node_modules', 'dist', 'build'];

// Contatori per statistiche
let filesChecked = 0;
let filesModified = 0;
let replacementsCount = 0;

/**
 * Funzione ricorsiva per navigare nelle directory
 */
function traverseDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !excludeDirs.includes(file)) {
      traverseDirectory(filePath);
    } else if (stat.isFile() && fileExtensions.includes(path.extname(file))) {
      processFile(filePath);
    }
  });
}

/**
 * Processa un singolo file
 */
function processFile(filePath) {
  filesChecked++;
  console.log(`Analisi di ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Verifica se il file importa useLocation da wouter
  const hasUseLocation = content.includes('useLocation') && content.includes('wouter');
  const hasCreateUrl = content.includes('createUrl') && content.includes('basePath');
  
  // Cerca modelli di window.location.href = "..."
  const windowLocationAssignments = content.match(/window\.location\.href\s*=\s*(['"])[^'"]+\1/g);
  const windowLocationRedirects = content.match(/window\.location\.href\s*=\s*[^'"]+/g);
  
  // Combina tutti i match in un array
  const allMatches = [
    ...(windowLocationAssignments || []),
    ...(windowLocationRedirects || [])
  ];
  
  if (allMatches && allMatches.length > 0) {
    let needsNavigateImport = !hasUseLocation;
    let needsCreateUrlImport = !hasCreateUrl && content.includes('window.location.href = "/"') || 
                              content.includes('window.location.href = "/admin"');
    
    // Aggiungi gli import necessari
    if (needsNavigateImport || needsCreateUrlImport) {
      // Trova la posizione dove inserire gli import
      let importSection = content.match(/(import[^;]*;(\s*\/\/[^\n]*\n|\s*\n)*)+/);
      
      if (importSection) {
        const importSectionEnd = importSection.index + importSection[0].length;
        let importToAdd = '';
        
        if (needsNavigateImport) {
          importToAdd += 'import { useLocation } from "wouter";\n';
        }
        
        if (needsCreateUrlImport) {
          importToAdd += 'import { createUrl } from "@/lib/basePath";\n';
        }
        
        content = content.substring(0, importSectionEnd) + importToAdd + content.substring(importSectionEnd);
      }
    }
    
    // Aggiungi la dichiarazione di useLocation al componente se necessario
    if (needsNavigateImport) {
      const componentDeclaration = content.match(/function\s+\w+\s*\([^)]*\)\s*{/);
      if (componentDeclaration) {
        const declarationEnd = componentDeclaration.index + componentDeclaration[0].length;
        content = content.substring(0, declarationEnd) + 
                  '\n  const [, navigate] = useLocation();\n' + 
                  content.substring(declarationEnd);
      }
    }
    
    // Sostituisci tutte le occorrenze di window.location.href
    allMatches.forEach(match => {
      let url = match.split('=')[1].trim();
      
      // Rimuovi eventuale punto e virgola alla fine
      if (url.endsWith(';')) {
        url = url.slice(0, -1).trim();
      }
      
      // Prepara la nuova espressione con navigate()
      let replacement;
      
      if (url.startsWith('"') || url.startsWith("'")) {
        // È un URL statico
        const urlContent = url.slice(1, -1); // Rimuovi le virgolette
        
        if (urlContent.startsWith('/')) {
          // URL interno all'app
          replacement = `navigate(createUrl("${urlContent}"))`;
        } else {
          // URL esterno o dinamico
          replacement = `navigate("${urlContent}")`;
        }
      } else {
        // È un URL dinamico o una variabile
        replacement = `navigate(${url})`;
      }
      
      content = content.replace(match, replacement);
      replacementsCount++;
    });
    
    // Se sono state fatte modifiche, scrivi il file
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      filesModified++;
      console.log(`✓ ${filePath} - ${allMatches.length} sostituzioni`);
    }
  }
}

// Esegui lo script
console.log('Inizio sostituzione di window.location.href con navigate()...');
traverseDirectory(srcDir);

console.log(`
Operazione completata:
- ${filesChecked} file analizzati
- ${filesModified} file modificati
- ${replacementsCount} sostituzioni eseguite
`);