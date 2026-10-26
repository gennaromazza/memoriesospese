import { describe, expect, it } from 'vitest';
import type { BundleItem, Product } from '@shared/booking-types';
import {
  countBundlePhotos,
  expandOrderProductsToRequirements,
  getBundleGalleryPhotoCount,
  getRequiredGalleryPhotoCount,
  isValidBundlePhotoSource,
  resolveBundleItems,
} from './bundle-photos';
import { catalogProductToQuoteProduct } from './quote-mappers';

const items: BundleItem[] = [
  { prodottoId: 'album', prodottoNome: 'Album', prodottoCategoria: 'album', quantita: 1, numeroFoto: 50 },
  { prodottoId: 'prints', prodottoNome: 'Stampe', prodottoCategoria: 'stampe', quantita: 2, numeroFoto: 10 },
];

describe('bundle photos', () => {
  it('sums component photos multiplied by quantities', () => {
    expect(countBundlePhotos(items)).toBe(70);
    expect(countBundlePhotos([{ ...items[1], quantita: 3 }])).toBe(30);
    expect(countBundlePhotos([])).toBe(0);
  });

  it('uses current catalog counts without changing saved snapshots', () => {
    const catalog = [{ id: 'album', nome: 'Album nuovo', categoria: 'album', numeroFoto: 80 }] as Product[];
    const resolved = resolveBundleItems(items, catalog);
    expect(countBundlePhotos(resolved)).toBe(100);
    expect(resolved[0].prodottoNome).toBe('Album nuovo');
    expect(items[0].numeroFoto).toBe(50);
    expect(resolved[1]).toEqual(items[1]);
  });

  it('supports components without photos and removed components', () => {
    expect(countBundlePhotos([{ ...items[0], numeroFoto: 0 }])).toBe(0);
    expect(countBundlePhotos(resolveBundleItems(items, []))).toBe(70);
    expect(resolveBundleItems()).toEqual([]);
  });

  it('uses the selected source product as the shared gallery size', () => {
    expect(getBundleGalleryPhotoCount(items)).toBe(70);
    const sharedBundle: BundleItem[] = [
      { ...items[0], prodottoId: 'shooting', prodottoNome: 'Shooting', numeroFoto: 40 },
      { ...items[0], prodottoId: 'album', prodottoNome: 'Album', numeroFoto: 15 },
      { ...items[1], prodottoId: 'accessory', prodottoNome: 'Accessorio', quantita: 2, numeroFoto: 1 },
    ];

    // The customer sees one 40-photo source gallery; included product quotas remain separate.
    expect(getBundleGalleryPhotoCount(sharedBundle, 'shooting')).toBe(40);
    expect(sharedBundle[1].numeroFoto).toBe(15);
    expect(sharedBundle[2]).toMatchObject({ quantita: 2, numeroFoto: 1 });
    expect(countBundlePhotos(sharedBundle)).toBe(57);
    expect(getBundleGalleryPhotoCount(sharedBundle, 'missing-source')).toBe(0);
    expect(getBundleGalleryPhotoCount([])).toBe(0);
  });

  it('rejects a shared gallery source that is removed, empty, or no longer in the catalog', () => {
    expect(isValidBundlePhotoSource(items, 'album')).toBe(true);
    expect(isValidBundlePhotoSource(items.filter((item) => item.prodottoId !== 'album'), 'album')).toBe(false);
    expect(isValidBundlePhotoSource([{ ...items[0], numeroFoto: 0 }], 'album')).toBe(false);
    expect(isValidBundlePhotoSource(items, 'album', new Set(['prints']))).toBe(false);
    expect(isValidBundlePhotoSource(items, 'album', new Set(['album', 'prints']))).toBe(true);
    expect(isValidBundlePhotoSource(items, 'missing-source')).toBe(false);
  });

  it('keeps one source gallery and the component photo quotas in a customer quote', () => {
    const bundle = {
      id: 'bundle',
      nome: 'Shooting + album',
      descrizione: '',
      prezzo: 100,
      prezzoFinale: 100,
      sconto: 0,
      numeroFoto: 57,
      categoria: 'pacchetto',
      attivo: true,
      immagini: [],
      isBundle: true,
      fotoCondivise: true,
      prodottoSorgenteFotoId: 'shooting',
      bundleItems: [
        { ...items[0], prodottoId: 'shooting', prodottoNome: 'Shooting', numeroFoto: 40 },
        { ...items[0], prodottoId: 'album', prodottoNome: 'Album', numeroFoto: 15 },
        { ...items[1], prodottoId: 'accessory', prodottoNome: 'Accessorio', quantita: 2, numeroFoto: 1 },
      ],
    } as Product;

    const quoteProduct = catalogProductToQuoteProduct(bundle, 'variabile');
    expect(quoteProduct).toMatchObject({
      numeroFoto: 40,
      fotoCondivise: true,
      prodottoSorgenteFotoId: 'shooting',
      bundleItems: [
        { prodottoId: 'shooting', numeroFoto: 40, quantita: 1 },
        { prodottoId: 'album', numeroFoto: 15, quantita: 1 },
        { prodottoId: 'accessory', numeroFoto: 1, quantita: 2 },
      ],
    });
  });

  it('keeps the previous quote count for bundles without a shared gallery', () => {
    const bundle = {
      id: 'bundle',
      nome: 'Album + stampe',
      descrizione: '',
      prezzo: 100,
      prezzoFinale: 100,
      sconto: 0,
      numeroFoto: 70,
      categoria: 'pacchetto',
      attivo: true,
      immagini: [],
      isBundle: true,
      bundleItems: items,
    } as Product;

    const quoteProduct = catalogProductToQuoteProduct(bundle, 'variabile');
    expect(quoteProduct.numeroFoto).toBe(70);
    expect(quoteProduct.fotoCondivise).toBeUndefined();
    expect(quoteProduct.prodottoSorgenteFotoId).toBeUndefined();
  });

  it('expands shared-bundle orders into separate requirements without adding component quotas together', () => {
    const requirements = expandOrderProductsToRequirements([{
      prodottoId: 'bundle',
      prodottoNome: 'Shooting + album',
      prodottoNumeroFoto: 40,
      quantita: 1,
      isBundle: true,
      fotoCondivise: true,
      prodottoSorgenteFotoId: 'shooting',
      bundleItems: [
        { prodottoId: 'shooting', prodottoNome: 'Shooting', quantita: 1, numeroFoto: 40 },
        { prodottoId: 'album', prodottoNome: 'Album', quantita: 1, numeroFoto: 15 },
        { prodottoId: 'accessory', prodottoNome: 'Accessorio', quantita: 2, numeroFoto: 1 },
      ],
    }]);

    expect(requirements).toEqual([
      { prodottoId: 'shooting', prodottoNome: 'Shooting - Shooting + album', prodottoNumeroFoto: 40, galleriaCondivisaId: 'bundle:0:shooting' },
      { prodottoId: 'album', prodottoNome: 'Album - Shooting + album', prodottoNumeroFoto: 15, galleriaCondivisaId: 'bundle:0:shooting' },
      { prodottoId: 'accessory', prodottoNome: 'Accessorio (1/2) - Shooting + album', prodottoNumeroFoto: 1, galleriaCondivisaId: 'bundle:0:shooting' },
      { prodottoId: 'accessory', prodottoNome: 'Accessorio (2/2) - Shooting + album', prodottoNumeroFoto: 1, galleriaCondivisaId: 'bundle:0:shooting' },
    ]);
    expect(getRequiredGalleryPhotoCount(requirements)).toBe(40);
  });

  it('preserves the existing total and per-unit order behavior when photos are not shared', () => {
    const bundleRequirements = expandOrderProductsToRequirements([{
      prodottoNome: 'Bundle standard',
      quantita: 1,
      isBundle: true,
      bundleItems: items,
    }]);
    const productRequirements = expandOrderProductsToRequirements([{
      prodottoId: 'album',
      prodottoNome: 'Album',
      prodottoNumeroFoto: 50,
      quantita: 2,
    }]);

    expect(bundleRequirements.reduce((sum, requirement) => sum + requirement.prodottoNumeroFoto, 0)).toBe(70);
    expect(productRequirements).toHaveLength(2);
    expect(productRequirements.map((requirement) => requirement.prodottoNumeroFoto)).toEqual([50, 50]);
  });
});
