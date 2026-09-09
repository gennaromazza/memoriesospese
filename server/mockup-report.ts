import sharp from 'sharp';
import { z } from 'zod';
import { mockupConfigurationSchema, type SavedMockup } from '../shared/mockup-types.js';

export const mockupConfirmSchema = z.object({
  revision: z.number().int().min(1),
  configuration: mockupConfigurationSchema,
  previews: z.array(z.object({ label: z.string().max(100), image: z.string().max(2_000_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/) }).strict()).length(8),
}).strict();
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Solo markup prodotto dal server e immagini raster ricodificate, mai HTML dal browser. */
export async function buildMockupReport(saved: SavedMockup, previews: z.infer<typeof mockupConfirmSchema>['previews']): Promise<Buffer> {
  const option = saved.option!;
  const material = option.materials.find(m => m.id === saved.configuration.materialId)!;
  const rows = [
    ['Laboratorio', option.labName], ['Modello', option.name], ['Codice modello fornitore', option.supplierCode || 'Non impostato'],
    ['Rivestimento', material.label], ['Codice rivestimento fornitore', material.supplierCode || 'Non impostato'],
    ['Scritta superiore', 'frameFinish' in saved.configuration && saved.configuration.coverLayout !== 'plaque' ? 'Non applicata' : saved.configuration.topText],
    ['Scritta inferiore', 'frameFinish' in saved.configuration && saved.configuration.coverLayout !== 'plaque' ? 'Non applicata' : saved.configuration.bottomText],
    ['Copertina', { full: 'Foto a tutta facciata', oblique: 'Taglio obliquo', plaque: 'Placchetta incisa', 'photo-plaque': 'Foto formato placchetta' }[saved.configuration.coverLayout]],
    ['Versione fotolibro', saved.version], ['Revisione mockup confermata', saved.revision], ['Confermato dallo studio', saved.confirmedAt],
  ];
  if ('frameFinish' in saved.configuration) rows.push(['Finitura struttura', { wood: 'Legno naturale', white: 'Bianco', fabric: `Tessuto · ${material.label}` }[saved.configuration.frameFinish]], ['Dimensioni', 'Formato dichiarato 30 × 80 cm; proporzioni della struttura indicative']);
  if ('backCover' in saved.configuration) rows.push(['Retro album', saved.configuration.backCover === 'photo' ? 'Foto a tutta superficie su plexiglass' : 'Tessuto coordinato']);
  if ('engravingNames' in saved.configuration && saved.configuration.coverLayout === 'plaque') {
    rows[5] = ['Primo nome inciso', saved.configuration.engravingNames.first];
    rows[6] = ['Secondo nome inciso', saved.configuration.engravingNames.second];
    rows.push(['Grafica incisione', 'Monogramma botanico con iniziali automatiche']);
  }
  const images: string[] = [];
  for (const preview of previews) {
    const input = Buffer.from(preview.image.split(',')[1], 'base64');
    const output = await sharp(input, { limitInputPixels: 4_000_000 }).resize(1600, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    images.push(`<figure><img alt="${escape(preview.label)}" src="data:image/jpeg;base64,${output.toString('base64')}"><figcaption>${escape(preview.label)}</figcaption></figure>`);
  }
  return Buffer.from(`<!doctype html><html lang="it"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mockup ${escape(option.name)} — revisione ${saved.revision}</title><style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:16px;color:#26312d}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:10px;text-align:left;overflow-wrap:anywhere}img{width:100%;height:auto}figure{margin:24px 0;break-inside:avoid}small{display:block;margin:20px 0}</style><h1>${escape(option.name)} — mockup confermato</h1><table>${rows.map(([key,value]) => `<tr><th>${escape(key)}</th><td>${escape(value)}</td></tr>`).join('')}</table><small>Riferimento visivo approvato dallo studio. Materiali, colori e proporzioni sono indicativi. Non è un file esecutivo di stampa.</small>${images.join('')}</html>`, 'utf8');
}
