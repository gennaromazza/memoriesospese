import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MOCKUP_MODEL, MOCKUP_RENDERERS, ROTATING_MOCKUP_MODEL } from '../shared/mockup-catalog';
import { mockupConfigurationSchema, type SavedMockup } from '../shared/mockup-types';
import { buildMockupReport } from './mockup-report';

const material = MOCKUP_MODEL.variants[0];
const base = { modelId: 'album-girevole', assetRevision: 4, materialId: material.id, appearanceRevision: material.appearanceRevision, coverLayout: 'plaque', frameFinish: 'wood', topText: 'Dedica storica', bottomText: 'Ricordi', photoAssetId: null, crop: { zoom: 1, x: .5, y: .5 }, backCover: 'fabric', backPhotoAssetId: null, backCrop: { zoom: 1, x: .5, y: .5 } };

describe('Revisione fisica 4 del modello girevole', () => {
  it('registra il nuovo renderer senza riutilizzare la cartella di una revisione storica', () => {
    expect(ROTATING_MOCKUP_MODEL.assetRevision).toBe(4);
    expect(MOCKUP_RENDERERS.find(r => r.id === ROTATING_MOCKUP_MODEL.id)?.path).toBe('girevole-v4/index.html');
  });
  it.each([1, 2, 3, 4])('conserva i salvataggi della revisione %i', revision => {
    const { backCover, backPhotoAssetId, backCrop, ...v1 } = base;
    const configuration = { ...(revision === 1 ? v1 : base), assetRevision: revision, ...(revision === 3 ? { engravingNames: { first: 'Anna', second: 'Jacopo' } } : {}) };
    expect(mockupConfigurationSchema.parse(configuration)).toEqual(configuration);
  });
  it('la nuova configurazione può conservare le righe legacy oppure il monogramma', () => {
    expect(mockupConfigurationSchema.parse(base)).toEqual(base);
    const monogram = { ...base, engravingNames: { first: 'Éléonore', second: 'Gian Marco' } };
    expect(mockupConfigurationSchema.parse(monogram)).toEqual(monogram);
    expect(mockupConfigurationSchema.safeParse({ ...base, engravingNames: { first: 'A'.repeat(51), second: '' } }).success).toBe(false);
  });
  it('richiede la foto soltanto se si sceglie la stampa sul plexiglass', () => {
    expect(mockupConfigurationSchema.safeParse({ ...base, backCover: 'photo' }).success).toBe(false);
    expect(mockupConfigurationSchema.safeParse({ ...base, backCover: 'photo', backPhotoAssetId: '11111111-1111-4111-8111-111111111111' }).success).toBe(true);
    expect(mockupConfigurationSchema.safeParse({ ...base, backCrop: { zoom: 4, x: .5, y: .5 } }).success).toBe(false);
  });
  it('nel report v4 distingue scrigno fotografico e retro tessuto del libro', async () => {
    const configuration = mockupConfigurationSchema.parse({ ...base, backCover: 'photo', backPhotoAssetId: '11111111-1111-4111-8111-111111111111' });
    const saved: SavedMockup = { configuration, version: 1, revision: 1, updatedAt: '2026-09-09T12:00:00Z', option: { id: '11111111-1111-4111-8111-111111111111', name: 'Plaza', rendererId: 'album-girevole', supplierCode: '', active: true, materialIds: [material.id], materials: [{ id: material.id, label: 'Tessuto test', supplierCode: '' }], labId: 'lab', labName: 'Laboratorio test' } };
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#eee' } }).jpeg().toBuffer();
    const previews = Array.from({ length: 8 }, (_, i) => ({ label: `Vista ${i + 1}`, image: `data:image/jpeg;base64,${png.toString('base64')}` }));
    const report = (await buildMockupReport(saved, previews)).toString();
    expect(report).toContain('Plexiglass posteriore dello scrigno girevole');
    expect(report).toContain('rimane sullo scrigno quando l’album viene estratto');
    expect(report).toContain('<th>Retro album</th><td>Tessuto coordinato</td>');
    const legacy = { ...saved, configuration: mockupConfigurationSchema.parse({ ...configuration, assetRevision: 2 }) };
    const oldReport = (await buildMockupReport(legacy, previews)).toString();
    expect(oldReport).not.toContain('Plexiglass posteriore dello scrigno girevole');
    expect(oldReport).toContain('<th>Retro album</th><td>Foto a tutta superficie su plexiglass</td>');
  });
});
