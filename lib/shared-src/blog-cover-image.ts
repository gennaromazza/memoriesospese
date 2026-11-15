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
