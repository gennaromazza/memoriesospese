import { analytics } from "./firebase";
import { logEvent } from "firebase/analytics";

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
  
  logEvent(analytics, 'page_view', {
    page_path: path
  });
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
  if (typeof window === 'undefined' || !analytics) return;
  
  logEvent(analytics, action, {
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
  if (typeof window === 'undefined' || !analytics) return;
  
  logEvent(analytics, 'view_gallery', {
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
  if (typeof window === 'undefined' || !analytics) return;
  
  logEvent(analytics, 'download_photo', {
    photo_name: photoName,
    gallery_code: galleryCode
  });
};

/**
 * Traccia le richieste di password
 * @param galleryCode Codice della galleria
 */
export const trackPasswordRequest = (galleryCode: string) => {
  if (typeof window === 'undefined' || !analytics) return;
  
  logEvent(analytics, 'password_request', {
    gallery_code: galleryCode
  });
};