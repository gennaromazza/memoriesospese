import { describe, expect, it } from 'vitest';
import {
  getBlogCoverImageFormat,
  getBlogCoverImageFormatFromUrl,
} from '@shared/blog-cover-image';

describe('Blog cover image formats', () => {
  it.each([
    ['image/jpeg', 'image/jpeg', '.jpg'],
    ['image/jpg', 'image/jpeg', '.jpg'],
    ['image/png', 'image/png', '.png'],
    ['image/webp', 'image/webp', '.webp'],
  ])('normalizes %s to a matching extension and content type', (input, contentType, extension) => {
    expect(getBlogCoverImageFormat(input)).toEqual({ contentType, extension });
  });

  it.each(['image/gif', 'image/svg+xml', 'application/octet-stream', ''])(
    'rejects unsupported upload format %s',
    (contentType) => {
      expect(getBlogCoverImageFormat(contentType)).toBeNull();
    },
  );

  it.each([
    ['https://cdn.example/cover.jpg?token=one', 'image/jpeg'],
    ['https://cdn.example/cover.jpeg', 'image/jpeg'],
    ['/covers/cover.png?width=1200', 'image/png'],
    ['https://cdn.example/cover.webp', 'image/webp'],
  ])('infers the crawler content type from the URL %s', (url, contentType) => {
    expect(getBlogCoverImageFormatFromUrl(url)?.contentType).toBe(contentType);
  });
});
