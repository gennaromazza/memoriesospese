// Vite usa `client/` come root. Tenere qui una configurazione esplicita evita
// che i builder isolati si fermino al package boundary di client/package.json
// e pubblichino per errore le direttive @tailwind non compilate.
export { default } from '../postcss.config.js';
