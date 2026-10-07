import { I_NOBILI_MATERIALS } from '../shared/i-nobili-catalog';
import { optionAllowsMaterials } from '../shared/mockup-workflow';
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { PLAZA_MOCKUP_MODEL } from '../shared/mockup-catalog';
import { mockupConfigurationSchema, type SavedMockup } from '../shared/mockup-types';
import { buildMockupReport } from './mockup-report';

const material = PLAZA_MOCKUP_MODEL.variants[0];
const photo = '11111111-1111-4111-8111-111111111111';
const base = { modelId: 'plaza-led', assetRevision: 2, materialId: material.id, appearanceRevision: material.appearanceRevision, coverLayout: 'split-photo-fabric', frameFinish: 'fabric', topText: '', bottomText: '', photoAssetId: photo, crop: { zoom: 1, x: .5, y: .5 }, backCover: 'photo', backPhotoAssetId: photo, backCrop: { zoom: 1, x: .5, y: .5 }, ledEnabled: false, engravingNames: { first: 'Anna', second: 'Marco' } };

describe('Plaza LED reference revision', () => {
  it('preserves independent Nobili materials and rejects unavailable inner materials', () => {
    const [outer, inner] = I_NOBILI_MATERIALS;
    const c = { ...base, materialId: outer.id, appearanceRevision: 1, innerMaterialId: inner.id, innerAppearanceRevision: 1 };
    expect(mockupConfigurationSchema.parse(c)).toEqual(c);
    expect(mockupConfigurationSchema.safeParse({ ...c, innerAppearanceRevision: 99 }).success).toBe(false);
    expect(mockupConfigurationSchema.safeParse({ ...c, innerMaterialId: photo }).success).toBe(false);
    const option: any = { labName: 'I Nobili', materials: [outer] };
    expect(optionAllowsMaterials(option, c)).toBe(false);
    option.materials.push(inner);
    expect(optionAllowsMaterials(option, c)).toBe(true);
  });
  it.each([1, 2])('normalizes old frame finishes to matching fabric in revision %i', assetRevision => {
    for (const frameFinish of ['wood', 'white', 'fabric']) {
      expect(mockupConfigurationSchema.parse({ ...base, assetRevision, frameFinish })).toMatchObject({ frameFinish: 'fabric' });
    }
    expect(mockupConfigurationSchema.safeParse({ ...base, assetRevision, frameFinish: 'metal' }).success).toBe(false);
  });
  it.each([1, 2])('round-trips revision %i without losing crop, names or LED state', assetRevision => {
    const configuration = { ...base, assetRevision };
    expect(mockupConfigurationSchema.parse(configuration)).toEqual(configuration);
  });
  it('rejects unavailable revisions and photographic layouts with missing assets', () => {
    expect(mockupConfigurationSchema.safeParse({ ...base, assetRevision: 3 }).success).toBe(false);
    expect(mockupConfigurationSchema.safeParse({ ...base, photoAssetId: null }).success).toBe(false);
    expect(mockupConfigurationSchema.safeParse({ ...base, backPhotoAssetId: null }).success).toBe(false);
    expect(mockupConfigurationSchema.safeParse({ ...base, backCrop: { zoom: 4, x: .5, y: .5 } }).success).toBe(false);
  });
  it('reports the rear image on the rotating case separately from the book', async () => {
    const saved: SavedMockup = { configuration: mockupConfigurationSchema.parse(base), version: 1, revision: 2, updatedAt: '2026-09-19T12:00:00Z', option: { id: photo, name: 'Plaza LED', rendererId: 'plaza-led', supplierCode: '', active: true, materialIds: [material.id], materials: [{ id: material.id, label: 'Tessuto', supplierCode: '' }], labId: 'lab', labName: 'Laboratorio' } };
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const previews = Array.from({ length: 8 }, () => ({ label: 'Vista', image: `data:image/jpeg;base64,${jpeg.toString('base64')}` }));
    const report = (await buildMockupReport(saved, previews)).toString();
    expect(report).toContain('rimane sullo scrigno');
    expect(report).toContain('Tessuto coordinato');
    expect(report).toContain('Spenta');
    expect(report).toContain('Nomi incisi sulla placchetta');
    expect(report).toContain('Placchetta laterale superiore in plexiglass');
    expect(report).toContain('Placchetta laterale inferiore in plexiglass');
    const photoOnly = { ...saved, configuration: mockupConfigurationSchema.parse({ ...base, coverLayout: 'full' }) };
    const photoReport = (await buildMockupReport(photoOnly, previews)).toString();
    expect(photoReport).toContain('<th>Placchetta laterale superiore in plexiglass</th><td>Anna</td>');
    expect(photoReport).toContain('<th>Placchetta laterale inferiore in plexiglass</th><td>Marco</td>');
  });
});
