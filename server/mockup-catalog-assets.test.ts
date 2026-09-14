import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MOCKUP_MODEL } from '../shared/mockup-catalog';
import { labMockupCatalogSchema } from '../shared/mockup-workflow';

const catalogPath = path.resolve('client/public/mockups/custodia-v1/peppe-lab-catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as {
  laboratories: Array<{ id: string; name: string; applicationLabId: string | null }>;
  families: Array<{ id: string; name: string; laboratoryId: string }>;
  variants: Array<Record<string, unknown> & {
    id: string;
    legacyId: string;
    label: string;
    familyId: string;
    laboratoryId: string;
    textureUrl: string;
    heightUrl: string;
    nativeTextureSizePx: [number, number];
    textureSha256: string;
    supplierCode: string | null;
    supplierColorName: string | null;
    physicalScaleVerified: boolean;
    physicalScaleSource?: string;
    estimatedRepeatMeters: number;
  }>;
  models: Array<{ materialPolicy: { allowedVariantIds: string[] } }>;
};

const spigato = catalog.variants.find(variant => variant.legacyId === 'spigato-beje')!;

describe('Catalogo tessuti Peppe Lab', () => {
  it('registra Spigato Beje una sola volta e lo limita al modello Peppe Lab', () => {
    expect(catalog.variants.filter(variant => variant.legacyId === 'spigato-beje')).toHaveLength(1);
    const family = catalog.families.find(item => item.id === spigato.familyId);
    expect(family).toMatchObject({ name: 'Spigato', laboratoryId: spigato.laboratoryId });
    expect(spigato).toMatchObject({
      label: 'Spigato Beje',
      supplierCode: null,
      supplierColorName: 'Beje',
      appearanceRevision: 2,
      texturePreparation: 'seam_blended_periodic_edge_feather',
      textureUrl: 'textures/official/spigato-beje-r2.png',
      heightUrl: 'textures/official/spigato-beje-height-r2.png',
      physicalScaleVerified: true,
      physicalScaleSource: 'photographer_declared_sample_width_0.05m_center_crop_1229px',
      estimatedRepeatMeters: 0.0296,
      sourceTextureSizePx: [2078, 1229],
      nativeTextureSizePx: [1200, 1200],
    });
    expect(catalog.models[0].materialPolicy.allowedVariantIds).toContain(spigato.id);
    expect(MOCKUP_MODEL.variants.find(variant => variant.id === spigato.id)).toEqual({
      id: spigato.id,
      appearanceRevision: 2,
    });
  });

  it('mantiene il catalogo importabile nel contratto condiviso con 38 materiali', () => {
    const laboratory = catalog.laboratories[0];
    const parsed = labMockupCatalogSchema.parse({
      revision: 0,
      materials: catalog.variants.map(variant => ({
        id: variant.id,
        label: variant.label,
        supplierCode: variant.supplierCode || '',
      })),
      models: [{
        id: catalog.models[0].materialPolicy.allowedVariantIds[0],
        name: 'Custodia',
        supplierCode: '',
        rendererId: MOCKUP_MODEL.id,
        active: true,
        materialIds: catalog.models[0].materialPolicy.allowedVariantIds,
      }],
    });
    expect(laboratory.applicationLabId).toBeNull();
    expect(parsed.materials).toHaveLength(38);
    expect(parsed.models[0].materialIds).toContain(spigato.id);
  });

  it('usa asset colore e height map seamless, quadrati e con hash dichiarato', async () => {
    const assetRoot = path.dirname(catalogPath);
    const colorPath = path.join(assetRoot, spigato.textureUrl);
    const heightPath = path.join(assetRoot, spigato.heightUrl);
    expect(fs.existsSync(colorPath)).toBe(true);
    expect(fs.existsSync(heightPath)).toBe(true);
    expect(spigato.textureUrl).not.toBe(spigato.heightUrl);
    expect(crypto.createHash('sha256').update(fs.readFileSync(colorPath)).digest('hex')).toBe(spigato.textureSha256);
    await expect(sharp(colorPath).metadata()).resolves.toMatchObject({ width: 1200, height: 1200, space: 'srgb' });
    await expect(sharp(heightPath).metadata()).resolves.toMatchObject({ width: 1200, height: 1200, space: 'b-w' });
    const { data, info } = await sharp(colorPath).raw().toBuffer({ resolveWithObject: true });
    const { data: heightData, info: heightInfo } = await sharp(heightPath).raw().toBuffer({ resolveWithObject: true });
    for (const [pixels, metadata] of [[data, info], [heightData, heightInfo]] as const) {
      const { width, height, channels } = metadata;
      for (let y = 0; y < height; y += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
          expect(pixels[(y * width) * channels + channel]).toBe(pixels[(y * width + width - 1) * channels + channel]);
        }
      }
      for (let x = 0; x < width; x += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
          expect(pixels[x * channels + channel]).toBe(pixels[((height - 1) * width + x) * channels + channel]);
        }
      }
    }
  });

  it('usa wrapping periodico nei renderer Custodia e Girevole v4', () => {
    for (const rendererPath of [
      'client/public/mockups/custodia-v1/viewer.js',
      'client/public/mockups/girevole-v4/viewer.js',
    ]) {
      const source = fs.readFileSync(rendererPath, 'utf8');
      expect(source).toContain('THREE.RepeatWrapping');
      expect(source).not.toContain('THREE.MirroredRepeatWrapping');
    }
  });
});