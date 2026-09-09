// Importazione meccanica del prototipo approvato: node scripts/import-album-mockup.mjs <cartella-v2>
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeMockupModel } from './sanitize-mockup-model.mjs';
const source = process.argv[2];
if (!source || !fs.existsSync(path.join(source, 'viewer.js'))) throw new Error('Cartella prototipo non valida');
const root = path.resolve('client/public/mockups/custodia-v1');
if (fs.existsSync(root)) throw new Error('Destinazione già presente: importazione interrotta per preservare le modifiche');
fs.mkdirSync(root, { recursive: true });
function copy(relative) {
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(source, relative), destination);
}
for (const file of ['index.html', 'viewer.js', 'report-template.js']) copy(file);
// Copia soltanto la chiusura degli import Three.js effettivamente utilizzati.
const seen = new Set();
function vendor(relative) {
  if (seen.has(relative)) return;
  seen.add(relative); copy(relative);
  const code = fs.readFileSync(path.join(source, relative), 'utf8');
  for (const match of code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    if (spec.startsWith('.')) vendor(path.posix.normalize(path.posix.join(path.posix.dirname(relative), spec)));
  }
}
for (const file of ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/environments/RoomEnvironment.js']) vendor(`vendor/package/${file}`);
copy('vendor/package/LICENSE');
const catalog = JSON.parse(fs.readFileSync(path.join(source, 'peppe-lab-catalog.json'), 'utf8'));
catalog.variants = catalog.variants.map(({ sourceUrl, sourceCropPx, sourceSha256, ...variant }) => variant);
for (const variant of catalog.variants) { copy(variant.textureUrl); copy(variant.heightUrl); }
fs.writeFileSync(path.join(root, 'peppe-lab-catalog.json'), JSON.stringify(catalog, null, 2));
const model = catalog.models[0];
fs.writeFileSync('shared/mockup-catalog.ts', '// Generato dal catalogo del prototipo Custodia; ID originali conservati.\nexport const MOCKUP_MODEL = ' + JSON.stringify({ id:model.id, name:'Custodia', assetRevision:model.assetRevision, coverLayouts:model.coverLayouts.map(l=>l.id), defaultCoverLayout:model.defaultCoverLayout, variants:catalog.variants.map(v=>({id:v.id,appearanceRevision:v.appearanceRevision})), defaultVariantId:(catalog.variants.find(v=>v.legacyId==='mist-03')||catalog.variants[0]).id }, null, 2) + ' as const;\n');
// Rimuove le immagini incorporate del prototipo dal GLB: nessuna foto dimostrativa viene pubblicata.
// Il viewer applica i tessuti del catalogo e la foto scelta dall'utente dopo il caricamento.
const glb = fs.readFileSync(path.join(source, 'album-studio.glb'));
fs.writeFileSync(path.join(root,'album-studio.glb'),await sanitizeMockupModel(glb));
console.log(`Importati Custodia, ${catalog.variants.length} materiali e ${seen.size} moduli Three.js 0.180.0.`);
