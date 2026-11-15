import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  blogSocialImage,
  defaultSocialImage,
  firstImageCandidateFromHtml,
  normalizePublicImageUrl,
  resolveSocialImage,
  staticSocialImage,
  weddingSocialImage,
} from './social-metadata';

describe('social metadata resolver', () => {
  it('normalizes canonicals onto the public production origin', () => {
    expect(canonicalUrl('/blog/prova')).toBe('https://imagestudiofotografico.com/blog/prova');
    expect(canonicalUrl('http://localhost:5000/blog/prova'))
      .toBe('https://imagestudiofotografico.com/blog/prova');
  });

  it('removes tracking and other query parameters from canonicals', () => {
    expect(canonicalUrl('/image-experience?utm_source=google&utm_campaign=landing&fbclid=abc#configura'))
      .toBe('https://imagestudiofotografico.com/image-experience');
    expect(canonicalUrl('/blog/prova?ref=homepage'))
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
      source: 'content-image',
    });
    expect(resolveSocialImage([
      { url: 'https://cdn.example/photo.webp', source: 'content-image' },
    ]).type).toBeUndefined();
  });

  it('extracts an inline image and otherwise reaches the global fallback', () => {
    expect(firstImageCandidateFromHtml('<p>Testo</p><img src="/images/story.jpg" />', 'Storia'))
      .toMatchObject({ url: 'https://imagestudiofotografico.com/images/story.jpg' });
    expect(resolveSocialImage([])).toEqual(defaultSocialImage());
  });

  it('resolves blog social images from the cover, inline content, then section fallback', () => {
    expect(blogSocialImage({
      title: 'Storia',
      coverImage: 'https://cdn.example/copertina.jpg',
      coverImageAlt: 'La copertina',
      content: '<img src="https://cdn.example/interna.jpg" alt="Foto interna">',
    })).toMatchObject({
      url: 'https://cdn.example/copertina.jpg',
      alt: 'La copertina',
      source: 'editorial-cover',
    });

    expect(blogSocialImage({
      title: 'Storia',
      coverImage: 'blob:copertina-non-valida',
      content: '<img src="https://cdn.example/interna.jpg" alt="Foto interna">',
    })).toMatchObject({
      url: 'https://cdn.example/interna.jpg',
      alt: 'Storia',
      source: 'content-image',
    });

    expect(blogSocialImage({
      title: 'Storia',
      coverImage: 'blob:copertina-non-valida',
      content: '<p>Nessuna immagine nel corpo</p>',
    }).source).toBe('section-fallback');

    expect(blogSocialImage({ title: 'Storia' }).source).toBe('section-fallback');
  });

  it('uses a known image MIME for a legacy .jpg URL and omits unknown MIME', () => {
    expect(blogSocialImage({
      title: 'Copertina PNG',
      coverImage: 'https://cdn.example/copertina.jpg',
      coverImageType: 'image/png',
    })).toMatchObject({
      url: 'https://cdn.example/copertina.jpg',
      type: 'image/png',
    });

    expect(blogSocialImage({
      title: 'Copertina legacy',
      coverImage: 'https://cdn.example/copertina.jpg',
    })).toMatchObject({
      url: 'https://cdn.example/copertina.jpg',
      source: 'editorial-cover',
    });
    expect(blogSocialImage({
      title: 'Copertina legacy',
      coverImage: 'https://cdn.example/copertina.jpg',
    }).type).toBeUndefined();
  });

  it('resolves wedding social images from the first valid selected photo or section fallback', () => {
    expect(weddingSocialImage('Anna e Luca', [
      { url: 'https://cdn.example/copertina.webp', alt: 'Copertina scelta' },
      { url: 'https://cdn.example/altra.jpg', alt: 'Seconda foto' },
    ])).toMatchObject({
      url: 'https://cdn.example/copertina.webp',
      alt: 'Copertina scelta',
      source: 'selected-photo',
    });

    expect(weddingSocialImage('Anna e Luca', [
      { url: 'blob:copertina-non-valida', alt: 'Copertina non valida' },
      { url: 'https://cdn.example/altra.jpg', alt: 'Seconda foto' },
    ])).toMatchObject({
      url: 'https://cdn.example/altra.jpg',
      alt: 'Seconda foto',
      source: 'selected-photo',
    });

    expect(weddingSocialImage('Anna e Luca', [
      { url: 'blob:copertina-non-valida' },
    ]).source).toBe('section-fallback');
    expect(weddingSocialImage('Anna e Luca', []).source).toBe('section-fallback');
  });

  it('assigns curated stable assets to important landing pages', () => {
    expect(staticSocialImage('/image-experience').url)
      .toContain('/images/image-experience/image-experience-social-1200x630.jpg');
    expect(staticSocialImage('/blog').url).toContain('/assets/og-image.jpg');
    expect(staticSocialImage('/stampa-foto-aversa').url).toContain('/images/print-service/');
    expect(staticSocialImage('/consulenze').url).toContain('/images/couple-flower-bouquet.png');
    expect(staticSocialImage('/portfolio/matrimonio').url).toContain('/images/portfolio/matrimonio.jpg');
    expect(staticSocialImage('/portfolio/battesimo').url).toContain('/images/portfolio/battesimo.jpg');
    expect(staticSocialImage('/portfolio/matrimonio').url)
      .not.toBe(staticSocialImage('/portfolio/battesimo').url);
  });
});