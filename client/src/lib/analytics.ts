import { analytics } from "./firebase";
import { logEvent } from "firebase/analytics";

type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

const compactAnalyticsData = (data: Record<string, unknown>): AnalyticsData =>
  Object.fromEntries(
    Object.entries(data).filter(([, value]) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    )
  ) as AnalyticsData;

/**
 * Sends an event to both Firebase Analytics (when configured) and Replit's
 * injected Umami tracker. Analytics must never break a customer flow.
 */
export const trackAnalyticsEvent = (name: string, data: Record<string, unknown> = {}) => {
  if (typeof window === 'undefined') return;

  const safeData = compactAnalyticsData(data);
  try {
    window.umami?.track(name, safeData);
  } catch {
    // Tracking is best-effort and must never block the UI.
  }

  if (!analytics) return;
  try {
    logEvent(analytics, name, safeData);
  } catch {
    // Firebase Analytics may be unavailable in development or with ad blockers.
  }
};

const BLOG_ATTRIBUTION_KEY = 'blog_attribution';

export interface BlogAttribution {
  firstArticleSlug: string;
  lastArticleSlug: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export const readBlogAttribution = (): BlogAttribution | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(BLOG_ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BlogAttribution>;
    if (
      typeof parsed.firstArticleSlug !== 'string' ||
      typeof parsed.lastArticleSlug !== 'string' ||
      typeof parsed.firstSeenAt !== 'string' ||
      typeof parsed.lastSeenAt !== 'string'
    ) {
      return null;
    }
    return parsed as BlogAttribution;
  } catch {
    return null;
  }
};

export const captureBlogAttribution = (articleSlug: string): BlogAttribution | null => {
  if (typeof window === 'undefined' || !articleSlug) return null;

  const now = new Date().toISOString();
  const previous = readBlogAttribution();
  const attribution: BlogAttribution = {
    firstArticleSlug: previous?.firstArticleSlug || articleSlug,
    lastArticleSlug: articleSlug,
    firstSeenAt: previous?.firstSeenAt || now,
    lastSeenAt: now,
  };

  try {
    window.sessionStorage.setItem(BLOG_ATTRIBUTION_KEY, JSON.stringify(attribution));
  } catch {
    // Private browsing/storage-disabled environments are valid no-op cases.
  }
  return attribution;
};

export const trackBlogEvent = (name: string, data: Record<string, unknown> = {}) => {
  trackAnalyticsEvent(name, { ...data, area: 'blog' });
};

export const trackBlogConversion = (
  conversion: string,
  data: Record<string, unknown> = {},
) => {
  const attribution = readBlogAttribution();
  if (!attribution) return;

  trackAnalyticsEvent('blog_conversion', {
    conversion,
    area: 'blog',
    first_article_slug: attribution.firstArticleSlug,
    last_article_slug: attribution.lastArticleSlug,
    ...data,
  });
};

/**
 * Inizializza Google Analytics - già gestito tramite firebase.ts
 */
export const initGA = () => {
  // L'inizializzazione di Analytics avviene automaticamente in firebase.ts
};

/**
 * Traccia le visualizzazioni di pagina
 * @param path Percorso della pagina
 */
export const trackPageView = (path: string) => {
  if (typeof window === 'undefined' || !analytics) return;
  try {
    logEvent(analytics, 'page_view', { page_path: path });
  } catch {
    // Firebase Analytics may be unavailable in development or with ad blockers.
  }
};

/**
 * Traccia gli eventi personalizzati
 * @param action Nome dell'azione
 * @param category Categoria dell'evento
 * @param label Etichetta dell'evento
 * @param value Valore numerico opzionale
 */
export const trackEvent = (
  action: string, 
  category?: string, 
  label?: string, 
  value?: number
) => {
  trackAnalyticsEvent(action, {
    event_category: category,
    event_label: label,
    value: value,
  });
};

/**
 * Traccia le visualizzazioni delle gallerie
 * @param galleryName Nome della galleria
 * @param galleryCode Codice della galleria
 */
export const trackGalleryView = (galleryName: string, galleryCode: string) => {
  trackAnalyticsEvent('view_gallery', {
    gallery_name: galleryName,
    gallery_code: galleryCode
  });
};

/**
 * Traccia i download delle foto
 * @param photoName Nome della foto
 * @param galleryCode Codice della galleria
 */
export const trackPhotoDownload = (photoName: string, galleryCode: string) => {
  trackAnalyticsEvent('download_photo', {
    photo_name: photoName,
    gallery_code: galleryCode
  });
};

/**
 * Traccia le richieste di password
 * @param galleryCode Codice della galleria
 */
export const trackPasswordRequest = (galleryCode: string) => {
  trackAnalyticsEvent('password_request', {
    gallery_code: galleryCode
  });
};