import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  defaultSocialImage,
  firstImageCandidateFromHtml,
  normalizePublicImageUrl,
  resolveSocialImage,
  staticSocialImage,
} from './social-metadata';

describe('social metadata resolver', () => {
  it('normalizes canonicals onto the public production origin', () => {
    expect(canonicalUrl('/blog/prova')).toBe('https://imagestudiofotografico.com/blog/prova');
    expect(canonicalUrl('http://localhost:5000/blog/prova'))
      .toBe('https://imagestudiofotografico.com/blog/prova');
  });

  it('accepts stable HTTPS images and rejects local or expiring signed URLs', () => {
    expect(normalizePublicImageUrl('/assets/og-image.jpg'))
      .toBe('https://imagestudiofotografico.com/assets/og-image.jpg');
    expect(normalizePublicImageUrl('http://localhost:5000/private.jpg')).toBeNull();
    expect(normalizePublicImageUrl('https://cdn.example/photo.jpg?X-Amz-Signature=secret')).toBeNull();
  });

  it('uses the first valid candidate and preserves available image metadata', () => {
    expect(resolveSocialImage([
      { url: 'blob:private', source: 'editorial-cover' },
      {
        url: 'https://cdn.example/photo.webp',
        alt: 'Foto articolo',
        width: 1200,
        height: 630,
        source: 'content-image',
      },
    ])).toMatchObject({
      url: 'https://cdn.example/photo.webp',
      alt: 'Foto articolo',
      width: 1200,
      height: 630,
      type: 'image/webp',
      source: 'content-image',
    });
  });

  it('extracts an inline image and otherwise reaches the global fallback', () => {
    expect(firstImageCandidateFromHtml('<p>Testo</p><img src="/images/story.jpg" />', 'Storia'))
      .toMatchObject({ url: 'https://imagestudiofotografico.com/images/story.jpg' });
    expect(resolveSocialImage([])).toEqual(defaultSocialImage());
  });

  it('assigns curated stable assets to important landing pages', () => {
    expect(staticSocialImage('/blog').url).toContain('/assets/og-image.jpg');
    expect(staticSocialImage('/stampa-foto-aversa').url).toContain('/images/print-service/');
    expect(staticSocialImage('/consulenze').url).toContain('/images/couple-flower-bouquet.png');
    expect(staticSocialImage('/portfolio/matrimonio').url).toContain('/images/portfolio/matrimonio.jpg');
    expect(staticSocialImage('/portfolio/battesimo').url).toContain('/images/portfolio/battesimo.jpg');
    expect(staticSocialImage('/portfolio/matrimonio').url)
      .not.toBe(staticSocialImage('/portfolio/battesimo').url);
  });
});