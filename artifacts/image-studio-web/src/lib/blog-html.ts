import DOMPurify from 'dompurify';

const TRUSTED_VIDEO_PATHS: Array<{ host: string; pathPrefix: string }> = [
  { host: 'www.youtube.com', pathPrefix: '/embed/' },
  { host: 'youtube.com', pathPrefix: '/embed/' },
  { host: 'www.youtube-nocookie.com', pathPrefix: '/embed/' },
  { host: 'youtube-nocookie.com', pathPrefix: '/embed/' },
  { host: 'player.vimeo.com', pathPrefix: '/video/' },
];

const isTrustedVideoUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return TRUSTED_VIDEO_PATHS.some(
      allowed => url.hostname === allowed.host && url.pathname.startsWith(allowed.pathPrefix)
    );
  } catch {
    return false;
  }
};

/**
 * Sanifica l'HTML dei post preservando soltanto gli iframe video generati
 * dall'editor per YouTube/Vimeo. Qualsiasi altro iframe viene rimosso.
 */
export const sanitizeBlogHtml = (html: string): string => {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe'],
    ADD_ATTR: [
      'allow',
      'allowfullscreen',
      'frameborder',
      'loading',
      'referrerpolicy',
      'sandbox',
      'scrolling',
    ],
  });

  const template = document.createElement('template');
  template.innerHTML = sanitized;
  template.content.querySelectorAll('iframe').forEach(iframe => {
    const src = iframe.getAttribute('src') || '';
    if (!isTrustedVideoUrl(src)) {
      iframe.remove();
      return;
    }

    iframe.removeAttribute('srcdoc');
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    iframe.setAttribute('allowfullscreen', '');
  });

  return template.innerHTML;
};

export const hasEmbeddedDataImages = (html: string): boolean =>
  /<img\b[^>]*\bsrc\s*=\s*["']data:image\//i.test(html);