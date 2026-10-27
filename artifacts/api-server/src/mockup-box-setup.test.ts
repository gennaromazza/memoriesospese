import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { BOX_MOCKUP_MODEL, IMAGEBOX_MOCKUP_MODEL } from '../shared/mockup-catalog.js';
import { mockupAssetIds, mockupConfigurationSchema, mockupGraphicAssetIds, type SavedMockup } from '../shared/mockup-types.js';
import { mockupBoxSetupSchema, mockupImageBoxSetupSchema, mockupSelectionSchema, optionAllowsBoxSetup, setupFitsRenderer, type MockupOption } from '../shared/mockup-workflow.js';
import { buildMockupReport } from './mockup-report.js';

const v = BOX_MOCKUP_MODEL.variants[0];
const uuid = '11111111-1111-4111-8111-111111111111';
const option = (setup?: unknown): MockupOption => ({ id: uuid, name: 'Scatola', supplierCode: '', rendererId: 'scatola-cornice', active: true, materialIds: [v.id], labId: 'lab', labName: 'Lab', materials: [], setup: setup as MockupOption['setup'] });
const config = (extra: Record<string, unknown> = {}) => ({ modelId: 'scatola-cornice', assetRevision: 1, materialId: v.id, appearanceRevision: v.appearanceRevision, albumMaterialId: v.id, albumAppearanceRevision: v.appearanceRevision, coverLayout: 'photo', format: { w: 25, h: 35 }, photoAssetId: uuid, lidPhotoAssetId: uuid, coverPhotoAssetId: uuid, ...extra });

describe('Quadrobook: impostazioni dello studio', () => {
  it('formato fuori misura o grafica mancante vengono rifiutati', () => {
    expect(mockupBoxSetupSchema.safeParse({ format: { w: 10, h: 35 }, cover: { mode: 'photo' } }).success).toBe(false);
    expect(mockupBoxSetupSchema.safeParse({ format: { w: 25, h: 35 }, cover: { mode: 'graphic' } }).success).toBe(false);
    expect(mockupBoxSetupSchema.safeParse({ format: { w: 25, h: 35 }, cover: { mode: 'choice', graphicAssetId: uuid } }).success).toBe(true);
    expect(mockupSelectionSchema.safeParse({ labId: 'lab', modelId: uuid, setup: { format: { w: 30, h: 20 }, cover: { mode: 'photo' } } }).success).toBe(true);
  });
  it('il cliente non può cambiare formato né tipo di copertina imposto', () => {
    const fixed = option({ format: { w: 25, h: 35 }, cover: { mode: 'graphic', graphicAssetId: uuid } });
    expect(optionAllowsBoxSetup(fixed, { format: { w: 25, h: 35 }, coverLayout: 'graphic' })).toBe(true);
    expect(optionAllowsBoxSetup(fixed, { format: { w: 25, h: 35 }, coverLayout: 'photo' })).toBe(false);
    expect(optionAllowsBoxSetup(fixed, { format: { w: 30, h: 40 }, coverLayout: 'graphic' })).toBe(false);
    const choice = option({ format: { w: 25, h: 35 }, cover: { mode: 'choice', graphicAssetId: uuid } });
    expect(optionAllowsBoxSetup(choice, { format: { w: 25, h: 35 }, coverLayout: 'photo' })).toBe(true);
    expect(optionAllowsBoxSetup(option(), { format: { w: 25, h: 35 }, coverLayout: 'photo' })).toBe(false);
  });
  it('la configurazione con copertina foto richiede la foto', () => {
    expect(mockupConfigurationSchema.safeParse(config()).success).toBe(true);
    expect(mockupConfigurationSchema.safeParse(config({ coverPhotoAssetId: null })).success).toBe(false);
    expect(mockupConfigurationSchema.safeParse(config({ coverLayout: 'graphic', coverPhotoAssetId: null })).success).toBe(true);
  });
});

describe('ImageBox: formato dello studio, copertine e incisioni', () => {
  const graphic = '22222222-2222-4222-8222-222222222222';
  const imagebox = (extra: Record<string, unknown> = {}) => ({ modelId: IMAGEBOX_MOCKUP_MODEL.id, assetRevision: 1, materialId: v.id, appearanceRevision: v.appearanceRevision, albumMaterialId: v.id, albumAppearanceRevision: v.appearanceRevision, coverLayout: 'full', format: { w: 30, h: 20 }, photoAssetId: uuid, coverPhotoAssetId: uuid, coverEngraving: null, glassEngraving: null, ...extra });
  const ibOption = (setup?: unknown): MockupOption => ({ ...option(setup), rendererId: 'imagebox' });

  it('accetta solo i sei formati 20x30, 25x35, 30x40, verticali e orizzontali', () => {
    for (const [w, h] of [[20, 30], [30, 20], [25, 35], [35, 25], [30, 40], [40, 30]]) expect(mockupImageBoxSetupSchema.safeParse({ format: { w, h } }).success).toBe(true);
    expect(mockupImageBoxSetupSchema.safeParse({ format: { w: 25, h: 30 } }).success).toBe(false);
    expect(setupFitsRenderer('imagebox', { format: { w: 25, h: 35 }, cover: { mode: 'photo' } })).toBe(false);
    expect(setupFitsRenderer('scatola-cornice', { format: { w: 25, h: 35 } })).toBe(false);
    expect(mockupSelectionSchema.safeParse({ labId: 'lab', modelId: uuid, setup: { format: { w: 40, h: 30 } } }).success).toBe(true);
    expect(optionAllowsBoxSetup(ibOption({ format: { w: 40, h: 30 } }), { format: { w: 40, h: 30 }, coverLayout: 'plaque' })).toBe(true);
    expect(optionAllowsBoxSetup(ibOption({ format: { w: 40, h: 30 } }), { format: { w: 30, h: 40 }, coverLayout: 'plaque' })).toBe(false);
    expect(optionAllowsBoxSetup(ibOption(), { format: { w: 40, h: 30 }, coverLayout: 'full' })).toBe(false);
  });
  it('foto del fondo obbligatoria; foto di copertina tranne con la placchetta, che vuole la scritta', () => {
    expect(mockupConfigurationSchema.safeParse(imagebox()).success).toBe(true);
    expect(mockupConfigurationSchema.safeParse(imagebox({ photoAssetId: null })).success).toBe(false);
    expect(mockupConfigurationSchema.safeParse(imagebox({ coverPhotoAssetId: null })).success).toBe(false);
    expect(mockupConfigurationSchema.safeParse(imagebox({ coverLayout: 'plaque', coverPhotoAssetId: null })).success).toBe(false);
    expect(mockupConfigurationSchema.safeParse(imagebox({ coverLayout: 'plaque', coverPhotoAssetId: null, coverEngraving: { mode: 'text', text: 'Lorenzo' } })).success).toBe(true);
    // Sul tessuto l'incisione è facoltativa; foto piena e foto piccola non ne hanno.
    expect(mockupConfigurationSchema.safeParse(imagebox({ coverLayout: 'split-photo-fabric' })).success).toBe(true);
    expect(mockupConfigurationSchema.safeParse(imagebox({ coverEngraving: { mode: 'text', text: 'Lorenzo' } })).success).toBe(false);
  });
  it('scritte fino a tre righe e 120 caratteri; sul plexiglass bianca o nera', () => {
    const glass = (e: unknown) => mockupConfigurationSchema.safeParse(imagebox({ glassEngraving: e })).success;
    expect(glass({ mode: 'text', text: 'il mio battesimo', color: 'white' })).toBe(true);
    expect(glass({ mode: 'text', text: 'il mio battesimo', color: 'gold' })).toBe(false);
    expect(glass({ mode: 'text', text: 'il mio battesimo' })).toBe(false);
    expect(glass({ mode: 'text', text: 'a\nb\nc\nd', color: 'black' })).toBe(false);
    expect(glass({ mode: 'text', text: 'x'.repeat(121), color: 'black' })).toBe(false);
    expect(glass({ mode: 'graphic', assetId: graphic })).toBe(true);
  });
  it('elenca le grafiche tra gli asset da controllare', () => {
    const cfg = mockupConfigurationSchema.parse(imagebox({ coverLayout: 'split-photo-fabric', coverEngraving: { mode: 'graphic', assetId: graphic }, glassEngraving: { mode: 'text', text: 'Ciao', color: 'black' } }));
    expect(mockupGraphicAssetIds(cfg)).toEqual([graphic]);
    expect(mockupAssetIds(cfg).sort()).toEqual([uuid, graphic].sort());
  });
  it('il report indica formato, tessuti, copertina, incisioni e struttura', async () => {
    const configuration = mockupConfigurationSchema.parse(imagebox({ coverLayout: 'plaque', coverPhotoAssetId: null, coverEngraving: { mode: 'text', text: 'Lorenzo\n2026' }, glassEngraving: { mode: 'text', text: 'il mio battesimo', color: 'black' } }));
    const saved: SavedMockup = { configuration, version: 1, revision: 2, updatedAt: '2026-10-27T10:00:00Z', confirmedAt: '2026-10-27T10:00:00Z', option: { ...ibOption({ format: { w: 30, h: 20 } }), name: 'ImageBox', labName: 'PeppeLab', materials: [{ id: v.id, label: 'Tessuto scelto', supplierCode: 'PL-01' }] } };
    const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#eee' } }).jpeg().toBuffer();
    const previews = Array.from({ length: 8 }, (_, i) => ({ label: `Vista ${i + 1}`, image: `data:image/jpeg;base64,${jpg.toString('base64')}` }));
    const report = (await buildMockupReport(saved, previews)).toString();
    expect(report).toContain('<th>Formato album (deciso dallo studio)</th><td>30 × 20 cm orizzontale</td>');
    expect(report).toContain('<th>Tessuto album (retro e dorso)</th><td>Uguale alla scatola</td>');
    expect(report).toContain('Placchetta in legno incisa');
    expect(report).toContain('Scritta: «Lorenzo / 2026»');
    expect(report).toContain('Scritta: «il mio battesimo» · nera');
    expect(report).toContain('retro rivestito con il tessuto della scatola');
  });
});
