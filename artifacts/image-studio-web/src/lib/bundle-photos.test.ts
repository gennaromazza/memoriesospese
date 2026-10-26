import { describe, expect, it } from 'vitest';
import type { BundleItem, Product } from '@shared/booking-types';
import { countBundlePhotos, getBundleGalleryPhotoCount, resolveBundleItems } from './bundle-photos';

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

  it('shows the largest included photo count as the shared customer gallery size', () => {
    expect(getBundleGalleryPhotoCount(items)).toBe(50);
    expect(getBundleGalleryPhotoCount([
      { ...items[0], numeroFoto: 40 },
      { ...items[1], numeroFoto: 10 },
    ])).toBe(40);
    expect(getBundleGalleryPhotoCount([])).toBe(0);
  });
});
