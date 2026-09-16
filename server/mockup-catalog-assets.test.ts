import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MOCKUP_MODEL, MOCKUP_RENDERERS } from '../shared/mockup-catalog';
import { labMockupCatalogSchema } from '../shared/mockup-workflow';

const catalogPath = path.resolve('client/public/mockups/custodia-v1/peppe-lab-catalog.json');
type MockupCatalog = {
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
    heightSha256: string;
    supplierCode: string | null;
    supplierColorName: string | null;
    physicalScaleVerified: boolean;
    physicalScaleSource?: string;
    estimatedRepeatMeters: number;
  }>;
  models: Array<{ materialPolicy: { allowedVariantIds: string[] } }>;
};
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as MockupCatalog;

const spigato = catalog.variants.find(variant => variant.legacyId === 'spigato-beje')!;

const PERIODIC_EDGE_MAX_DELTA = 64;
const PERIODIC_EDGE_MEAN_DELTA = 20;

type PeriodicCatalog = {
  catalogPath: string;
  rendererPaths: string[];
  catalog: MockupCatalog;
};

function discoverPeriodicCatalogs(): PeriodicCatalog[] {
  const catalogs = new Map<string, PeriodicCatalog>();

  for (const renderer of MOCKUP_RENDERERS) {
    const viewerPath = path.resolve('client/public/mockups', renderer.path.replace(/index\.html$/, 'viewer.js'));
    const source = fs.readFileSync(viewerPath, 'utf8');
    if (!source.includes('THREE.RepeatWrapping')) continue;

    const references = [...source.matchAll(/(?:new URL|fetch)\(\s*['"]([^'"]+\.json)['"]/g)]
      .map(match => match[1])
      .filter((reference): reference is string => Boolean(reference));
    if (references.length === 0) {
      throw new Error(`Renderer "${renderer.id}" uses RepeatWrapping but does not identify a catalog JSON: ${viewerPath}`);
    }

    for (const reference of references) {
      const resolvedPath = path.resolve(path.dirname(viewerPath), reference);
      const existing = catalogs.get(resolvedPath);
      if (existing) {
        existing.rendererPaths.push(viewerPath);
        continue;
      }
      catalogs.set(resolvedPath, {
        catalogPath: resolvedPath,
        rendererPaths: [viewerPath],
        catalog: JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as MockupCatalog,
      });
    }
  }

  return [...catalogs.values()];
}

function assetFailure(
  laboratory: string,
  material: string,
  asset: string,
  detail: string,
): never {
  throw new Error(
    `Mockup texture validation failed: laboratory="${laboratory}" material="${material}" asset="${asset}" — ${detail}`,
  );
}

function edgeDifference(pixels: Buffer, width: number, height: number, channels: number) {
  let max = 0;
  let sum = 0;
  let samples = 0;
  const compare = (left: number, right: number) => {
    const difference = Math.abs(pixels[left] - pixels[right]);
    max = Math.max(max, difference);
    sum += difference;
    samples += 1;
  };

  for (let y = 0; y < height; y += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      compare((y * width) * channels + channel, (y * width + width - 1) * channels + channel);
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      compare(x * channels + channel, ((height - 1) * width + x) * channels + channel);
    }
  }

  return { max, mean: samples ? sum / samples : 0 };
}

async function validatePeriodicAsset(
  assetRoot: string,
  laboratory: string,
  variant: MockupCatalog['variants'][number],
  assetKind: 'color' | 'height',
  assetUrl: string,
  declaredHash: string,
  expectedSize: [number, number],
): Promise<[number, number]> {
  const assetPath = path.join(assetRoot, assetUrl);
  if (!fs.existsSync(assetPath)) {
    assetFailure(laboratory, variant.label, assetUrl, 'file does not exist');
  }
  if (!declaredHash) {
    assetFailure(laboratory, variant.label, assetUrl, `missing declared ${assetKind} SHA-256`);
  }

  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(assetPath)).digest('hex');
  if (actualHash !== declaredHash) {
    assetFailure(laboratory, variant.label, assetUrl, `SHA-256 mismatch (declared ${declaredHash}, actual ${actualHash})`);
  }

  const { data, info } = await sharp(assetPath).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== expectedSize[0] || info.height !== expectedSize[1]) {
    assetFailure(
      laboratory,
      variant.label,
      assetUrl,
      `dimensions ${info.width}×${info.height} do not match declared ${expectedSize[0]}×${expectedSize[1]}`,
    );
  }

  const edge = edgeDifference(data, info.width, info.height, info.channels);
  if (edge.max > PERIODIC_EDGE_MAX_DELTA || edge.mean > PERIODIC_EDGE_MEAN_DELTA) {
    assetFailure(
      laboratory,
      variant.label,
      assetUrl,
      `periodic border discontinuity (max Δ${edge.max}, mean Δ${edge.mean.toFixed(2)}; limits max Δ${PERIODIC_EDGE_MAX_DELTA}, mean Δ${PERIODIC_EDGE_MEAN_DELTA})`,
    );
  }
  return [info.width, info.height];
}

describe('Catalogo tessuti Peppe Lab', () => {
  it('registra Spigato Beje una sola volta e lo limita al modello Peppe Lab', () => {
    expect(catalog.variants.filter(variant => variant.legacyId === 'spigato-beje')).toHaveLength(1);
    const family = catalog.families.find(item => item.id === spigato.familyId);
    expect(family).toMatchObject({ name: 'Spigato', laboratoryId: spigato.laboratoryId });
    expect(spigato).toMatchObject({
      label: 'Spigato Beje',
      supplierCode: null,
      supplierColorName: 'Beje',
      appearanceRevision: 4,
      texturePreparation: 'periodic_low_frequency_flattened_seam_blended_brightened',
      textureUrl: 'textures/official/spigato-beje-r4.png',
      heightUrl: 'textures/official/spigato-beje-height-r4.png',
      physicalScaleVerified: true,
      physicalScaleSource: 'photographer_declared_sample_width_0.05m_center_crop_1229px',
      estimatedRepeatMeters: 0.0296,
      sourceTextureSizePx: [2078, 1229],
      nativeTextureSizePx: [1200, 1200],
    });
    expect(catalog.models[0].materialPolicy.allowedVariantIds).toContain(spigato.id);
    expect(MOCKUP_MODEL.variants.find(variant => variant.id === spigato.id)).toEqual({
      id: spigato.id,
      appearanceRevision: 4,
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

  it('verifica automaticamente ogni asset usato con wrapping periodico', async () => {
    const periodicCatalogs = discoverPeriodicCatalogs();
    expect(periodicCatalogs.length).toBeGreaterThan(0);

    for (const { catalogPath: discoveredCatalogPath, rendererPaths, catalog: discoveredCatalog } of periodicCatalogs) {
      const assetRoot = path.dirname(discoveredCatalogPath);
      for (const variant of discoveredCatalog.variants) {
        const laboratory = discoveredCatalog.laboratories.find(item => item.id === variant.laboratoryId);
        if (!laboratory) {
          assetFailure('unknown', variant.label, variant.textureUrl, `laboratory ${variant.laboratoryId} is not declared`);
        }
        if (!variant.heightSha256) {
          assetFailure(laboratory.name, variant.label, variant.heightUrl, 'missing declared height map SHA-256');
        }
        if (variant.textureUrl === variant.heightUrl) {
          assetFailure(laboratory.name, variant.label, variant.textureUrl, 'color and height map must be different assets');
        }

        const colorSize = await validatePeriodicAsset(
          assetRoot,
          laboratory.name,
          variant,
          'color',
          variant.textureUrl,
          variant.textureSha256,
          variant.nativeTextureSizePx,
        );
        const heightSize = await validatePeriodicAsset(
          assetRoot,
          laboratory.name,
          variant,
          'height',
          variant.heightUrl,
          variant.heightSha256,
          variant.nativeTextureSizePx,
        );
        if (colorSize[0] !== heightSize[0] || colorSize[1] !== heightSize[1]) {
          assetFailure(
            laboratory.name,
            variant.label,
            `${variant.textureUrl} + ${variant.heightUrl}`,
            `color dimensions ${colorSize[0]}×${colorSize[1]} do not match height dimensions ${heightSize[0]}×${heightSize[1]}`,
          );
        }
        if (colorSize[0] !== variant.nativeTextureSizePx[0] || colorSize[1] !== variant.nativeTextureSizePx[1]) {
          assetFailure(
            laboratory.name,
            variant.label,
            variant.textureUrl,
            `dimensions ${colorSize[0]}×${colorSize[1]} do not match nativeTextureSizePx ${variant.nativeTextureSizePx.join('×')}`,
          );
        }
      }
      expect(rendererPaths.length).toBeGreaterThan(0);
    }
  });

  it('usa wrapping periodico nei renderer attivi che caricano cataloghi materiali', () => {
    for (const renderer of MOCKUP_RENDERERS) {
      const rendererPath = path.resolve('client/public/mockups', renderer.path.replace(/index\.html$/, 'viewer.js'));
      const source = fs.readFileSync(rendererPath, 'utf8');
      if (source.includes('THREE.RepeatWrapping')) {
        expect(source).not.toContain('THREE.MirroredRepeatWrapping');
      }
    }
  });
});