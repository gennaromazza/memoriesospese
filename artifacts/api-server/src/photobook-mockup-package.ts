import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { storage } from './firebase-admin.js';
import type { SavedMockup } from '../shared/mockup-types.js';
import { mockupPrintMaterials } from '@shared/mockup-print-materials';
import { createCanvas } from '@napi-rs/canvas';
import { drawMonogram } from '../../image-studio-web/public/mockups/girevole-v3/monogram.js';

export const MOCKUP_PACKAGE_VERSION = 2;
export interface MockupPackageFile {
  name: string;
  mimeType: string;
  bytes: Buffer;
  sha256: string;
  sourceQuality?: 'original' | 'stored-preview';
}
type UnhashedMockupPackageFile = Omit<MockupPackageFile, 'sha256'>;

/** Read every source before starting Drive: missing material must never be silently omitted. */
export async function buildMockupPackage(book: DocumentSnapshot, saved: SavedMockup): Promise<MockupPackageFile[]> {
  const prefix = `MOCKUP-${book.id}-v${saved.version}-r${saved.revision}`;
  const [report] = await storage.bucket().file(saved.reportPath!).download();
  const files: UnhashedMockupPackageFile[] = [{ name: `${prefix}.html`, mimeType: 'text/html', bytes: report }];
  const notes = [
    `MATERIALI MOCKUP — ${saved.option!.name}`,
    `Versione ${saved.version} · revisione confermata ${saved.revision}`,
    'Il riepilogo HTML contiene le viste, i testi e le indicazioni delle incisioni.',
    'Le grafiche sono file sorgente forniti dallo studio, non tracciati macchina generati dal rendering.',
    '',
  ];
  const configuration = saved.configuration;
  if (configuration && 'engravingNames' in configuration && configuration.engravingNames && ['plaque', 'split-photo-fabric'].includes(configuration.coverLayout)
    && !(configuration.modelId === 'plaza-led' && configuration.assetRevision >= 2 && configuration.coverLayout === 'split-photo-fabric')) {
    const canvas = createCanvas(3200, 2200);
    drawMonogram(canvas, configuration.engravingNames.first, configuration.engravingNames.second);
    const name = `${prefix}-INCISIONE-monogramma.png`;
    files.push({ name, mimeType: 'image/png', bytes: canvas.toBuffer('image/png') });
    notes.push(`Incisione: ${configuration.engravingNames.first} / ${configuration.engravingNames.second}`);
    notes.push(`Grafica raster su fondo trasparente: ${name}. Generata con lo stesso disegno del mockup; verificare font, dimensioni finali e conversione in tracciati con il laboratorio. Non è un programma macchina.`);
  }
  for (const material of saved.configuration ? mockupPrintMaterials(saved.configuration, saved.option) : []) {
    const asset = (await book.ref.collection('mockupAssets').doc(material.id).get()).data();
    if (!asset?.storagePath || asset.version !== saved.version) throw new Error(`File del mockup non disponibile: ${material.label}. Ripristinalo prima di inviare.`);
    const sourcePath = asset.originalStoragePath || asset.storagePath;
    if (!sourcePath.startsWith(`photobook-mockups/${book.id}/`)) throw new Error('Percorso del materiale mockup non valido');
    const [bytes] = await storage.bucket().file(sourcePath).download();
    const extension = String(sourcePath).match(/\.(jpe?g|png|webp)$/i)?.[1]?.toLowerCase();
    if (!extension) throw new Error(`Formato del materiale non supportato: ${material.label}`);
    const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
    const label = material.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
    const name = `${prefix}-${label}-${material.id}.${extension}`;
    const sourceQuality = asset.originalStoragePath ? 'original' : 'stored-preview';
    files.push({ name, mimeType, bytes, sourceQuality });
    notes.push(`${material.label}: ${name}`);
    if (sourceQuality === 'stored-preview') notes.push('ATTENZIONE: caricamento precedente alla conservazione degli originali. Questa è la copia del mockup, eventualmente ridotta a 2048 px. Verificare la risoluzione prima della produzione; richiedere allo studio il file ad alta risoluzione se necessario.');
  }
  files.push({ name: `${prefix}-MATERIALI.txt`, mimeType: 'text/plain', bytes: Buffer.from(notes.join('\n'), 'utf8') });
  return files.map(file => ({ ...file, sha256: createHash('sha256').update(file.bytes).digest('hex') }));
}
