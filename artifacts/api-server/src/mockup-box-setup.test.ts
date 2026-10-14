import { describe, expect, it } from 'vitest';
import { BOX_MOCKUP_MODEL } from '../shared/mockup-catalog.js';
import { mockupConfigurationSchema } from '../shared/mockup-types.js';
import { mockupBoxSetupSchema, mockupSelectionSchema, optionAllowsBoxSetup, type MockupOption } from '../shared/mockup-workflow.js';

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
