/**
 * Test per verificare che la compressione delle immagini funzioni
 * in tutti i punti di caricamento dell'applicazione
 */

const fs = require('fs');

console.log('🖼️  VERIFICA COMPRESSIONE IMMAGINI');
console.log('====================================\n');

let totalChecks = 0;
let passedChecks = 0;
let warnings = 0;

function check(description, condition, errorMsg = '') {
  totalChecks++;
  if (condition) {
    console.log(`✅ ${description}`);
    passedChecks++;
  } else {
    console.log(`❌ ${description}: ${errorMsg}`);
  }
}

function warn(description, msg = '') {
  warnings++;
  console.log(`⚠️  ${description}: ${msg}`);
}

// 1. Verifica sistema centralizzato di compressione
const compressionExists = fs.existsSync('../client/src/lib/imageCompression.ts');
let hasCompressImage = false;
if (compressionExists) {
  const content = fs.readFileSync('../client/src/lib/imageCompression.ts', 'utf8');
  hasCompressImage = content.includes('export async function compressImage');
}
check(
  '1. Sistema centralizzato di compressione',
  compressionExists && hasCompressImage,
  'File imageCompression.ts mancante o funzione compressImage non esportata'
);

// 2. Verifica GuestUpload usa compressione centralizzata
const guestUploadExists = fs.existsSync('../client/src/components/GuestUpload.tsx');
let guestUsesCompression = false;
if (guestUploadExists) {
  const content = fs.readFileSync('../client/src/components/GuestUpload.tsx', 'utf8');
  guestUsesCompression = content.includes('import { compressImage }') && 
                        content.includes('compressImage(file)') &&
                        !content.includes('imageCompression(file,');
}
check(
  '2. GuestUpload usa compressione centralizzata',
  guestUsesCompression,
  'GuestUpload non usa compressImage centralizzato'
);

// 3. Verifica EditGalleryModal (admin upload) usa compressione
const editGalleryExists = fs.existsSync('../client/src/components/EditGalleryModal.tsx');
let adminUsesCompression = false;
if (editGalleryExists) {
  const content = fs.readFileSync('../client/src/components/EditGalleryModal.tsx', 'utf8');
  adminUsesCompression = content.includes('uploadPhotos(') && 
                        content.includes('handleUploadPhotos');
}
check(
  '3. EditGalleryModal usa sistema upload con compressione',
  adminUsesCompression,
  'EditGalleryModal non usa uploadPhotos con compressione'
);

// 4. Verifica photoUploader.ts ha compressione integrata
const photoUploaderExists = fs.existsSync('../client/src/lib/photoUploader.ts');
let uploaderHasCompression = false;
if (photoUploaderExists) {
  const content = fs.readFileSync('../client/src/lib/photoUploader.ts', 'utf8');
  uploaderHasCompression = content.includes('import { compressImage }') &&
                          content.includes('await compressImage(file)');
}
check(
  '4. photoUploader.ts integra compressione',
  uploaderHasCompression,
  'photoUploader.ts non ha compressione integrata'
);

// 5. Verifica NewGalleryModal usa compressione centralizzata
const newGalleryExists = fs.existsSync('../client/src/components/NewGalleryModal.tsx');
let newGalleryUsesCompression = false;
if (newGalleryExists) {
  const content = fs.readFileSync('../client/src/components/NewGalleryModal.tsx', 'utf8');
  newGalleryUsesCompression = content.includes('import { compressImage }') &&
                             content.includes('await compressImage(file)') &&
                             !content.includes('imageCompression(file, options)');
}
check(
  '5. NewGalleryModal usa compressione centralizzata',
  newGalleryUsesCompression,
  'NewGalleryModal non usa compressImage centralizzato'
);

// 6. Verifica impostazioni di compressione coerenti
if (compressionExists) {
  const compressionContent = fs.readFileSync('../client/src/lib/imageCompression.ts', 'utf8');
  const hasConsistentSettings = compressionContent.includes('maxSizeMB: 1') &&
                               compressionContent.includes('maxWidthOrHeight: 1920') &&
                               compressionContent.includes('useWebWorker: true');
  check(
    '6. Impostazioni di compressione coerenti',
    hasConsistentSettings,
    'Impostazioni compressione non standardizzate'
  );
}

// 7. Verifica componente FileUpload ha compressione
const fileUploadExists = fs.existsSync('../client/src/components/ui/file-upload.tsx');
let fileUploadHasCompression = false;
if (fileUploadExists) {
  const content = fs.readFileSync('../client/src/components/ui/file-upload.tsx', 'utf8');
  fileUploadHasCompression = content.includes('enableCompression') &&
                           content.includes('compressImage');
}
check(
  '7. Componente FileUpload supporta compressione',
  fileUploadHasCompression,
  'FileUpload non ha compressione configurabile'
);

// 8. Verifica package.json include browser-image-compression
const packageExists = fs.existsSync('../package.json');
let hasCompressionPackage = false;
if (packageExists) {
  const content = fs.readFileSync('../package.json', 'utf8');
  hasCompressionPackage = content.includes('browser-image-compression');
}
check(
  '8. Dipendenza browser-image-compression installata',
  hasCompressionPackage,
  'browser-image-compression non trovato in package.json'
);

console.log('\n📊 RIEPILOGO VERIFICA');
console.log('=====================');
console.log(`✅ Check completati: ${totalChecks}`);
console.log(`✅ Successi: ${passedChecks}`);
console.log(`❌ Errori: ${totalChecks - passedChecks}`);
console.log(`⚠️  Warning: ${warnings}`);

if (passedChecks === totalChecks) {
  console.log('\n🎯 COMPRESSIONE IMMAGINI COMPLETAMENTE FUNZIONANTE!');
  console.log('Tutti i punti di caricamento utilizzano la compressione:');
  console.log('- ✅ Ospiti (GuestUpload)');
  console.log('- ✅ Admin (EditGalleryModal → photoUploader)');
  console.log('- ✅ Nuove gallerie (NewGalleryModal)');
  console.log('- ✅ Sistema centralizzato e coerente');
  process.exit(0);
} else {
  console.log('\n❌ ALCUNI CONTROLLI FALLITI');
  console.log('Correggi gli errori sopra per garantire compressione completa');
  process.exit(1);
}