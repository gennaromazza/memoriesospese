import { canonicalUrl, staticSocialImage } from '../../../lib/shared-src/social-metadata';
import {
  PRINT_SERVICE_PATH,
  PRINT_SERVICE_SEO,
} from '../../../lib/shared-src/print-service-content';

const escapeHtmlAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const isManagedMetaTag = (tag: string) =>
  /\s(?:name|property)\s*=\s*(["'])(?:description|keywords|robots|googlebot|bingbot|og:[^"']+|twitter:[^"']+)\1/i
    .test(tag);

export function renderPrintSocialPageHtml(indexHtml: string): string {
  if (!/<\/head\s*>/i.test(indexHtml)) {
    throw new Error('Cannot generate print social HTML: index.html has no closing head tag.');
  }

  const canonical = canonicalUrl(PRINT_SERVICE_PATH);
  const socialImage = staticSocialImage(PRINT_SERVICE_PATH);
  const title = escapeHtmlAttribute(PRINT_SERVICE_SEO.title);
  const description = escapeHtmlAttribute(PRINT_SERVICE_SEO.description);
  const keywords = escapeHtmlAttribute(PRINT_SERVICE_SEO.keywords);
  const imageUrl = escapeHtmlAttribute(socialImage.url);
  const imageAlt = escapeHtmlAttribute(socialImage.alt);

  const printMetadata = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="keywords" content="${keywords}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="it_IT" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="${socialImage.width}" />
    <meta property="og:image:height" content="${socialImage.height}" />
    <meta property="og:image:type" content="${socialImage.type}" />
    <meta property="og:image:alt" content="${imageAlt}" />
    <meta property="og:site_name" content="Image Studio" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="${imageAlt}" />
  `;

  return indexHtml
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*>/gi, (tag) => isManagedMetaTag(tag) ? '' : tag)
    .replace(/<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>/gi, '')
    .replace(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/head\s*>/i, `${printMetadata}\n</head>`);
}
