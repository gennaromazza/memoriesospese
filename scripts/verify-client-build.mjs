import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outputRoot = resolve(process.cwd(), 'dist', 'app');
const html = readFileSync(resolve(outputRoot, 'index.html'), 'utf8');
const stylesheetMatches = [
  ...html.matchAll(/href=["']([^"']+\.css)["']/g),
];

if (stylesheetMatches.length === 0) {
  throw new Error('Build client non valido: nessun foglio CSS collegato');
}

const bundledCss = stylesheetMatches
  .map(match => match[1])
  .filter(href => href.startsWith('/assets/'))
  .map(href => readFileSync(resolve(outputRoot, href.slice(1)), 'utf8'))
  .join('\n');

if (!bundledCss) {
  throw new Error('Build client non valido: bundle CSS locale assente');
}

if (bundledCss.includes('@tailwind')) {
  throw new Error(
    'Build client non valido: direttive Tailwind non compilate nel CSS',
  );
}

if (!bundledCss.includes('--tw-translate-x') || !bundledCss.includes('.flex{')) {
  throw new Error(
    'Build client non valido: utility Tailwind fondamentali assenti dal CSS',
  );
}

console.log('CSS client verificato: Tailwind compilato correttamente');
