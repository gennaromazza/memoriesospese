export type BlogCoverImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface BlogCoverImageFormat {
  contentType: BlogCoverImageContentType;
  extension: '.jpg' | '.png' | '.webp';
}

const BLOG_COVER_IMAGE_FORMATS: Record<string, BlogCoverImageFormat> = {
  'image/jpeg': { contentType: 'image/jpeg', extension: '.jpg' },
  'image/jpg': { contentType: 'image/jpeg', extension: '.jpg' },
  'image/png': { contentType: 'image/png', extension: '.png' },
  'image/webp': { contentType: 'image/webp', extension: '.webp' },
};

export function getBlogCoverImageFormat(contentType: unknown): BlogCoverImageFormat | null {
  const normalizedType = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  return BLOG_COVER_IMAGE_FORMATS[normalizedType] || null;
}

export function getBlogCoverImageFormatFromUrl(value: unknown): BlogCoverImageFormat | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    const pathname = new URL(raw, 'https://blog-cover.invalid').pathname.toLowerCase();
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
      return BLOG_COVER_IMAGE_FORMATS['image/jpeg'];
    }
    if (pathname.endsWith('.png')) return BLOG_COVER_IMAGE_FORMATS['image/png'];
    if (pathname.endsWith('.webp')) return BLOG_COVER_IMAGE_FORMATS['image/webp'];
    return null;
  } catch {
    return null;
  }
}
