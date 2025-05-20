// Utility per gestire il percorso base dell'applicazione
// Supporta sia installazione root che in sottocartella

/** 
 * Restituisce sempre BASE_URL + path.
 * BASE_URL è '' in dev, '/wedgallery/' in prod.
 */
export const createUrl = (path: string): string => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
};

export const createAbsoluteUrl = (path: string): string => {
  const url = createUrl(path);
  return `${window.location.origin}${url}`.replace(/([^:]\/)\/+/g, '$1');
};

/**
 * Verifica se l'applicazione è in esecuzione in ambiente di produzione
 * @returns true se in produzione, false se in sviluppo
 */
export const isProduction = (): boolean => {
  return import.meta.env.PROD === true;
};

/**
 * Verifica se siamo in sottodirectory
 * @returns true se in produzione e PRODUCTION_BASE_PATH non è '/'
 */
export const isInSubdirectory = (): boolean => {
  // Durante lo sviluppo è false, in produzione verifica il percorso
  if (!import.meta.env.PROD) return false;
  // Verifica se il percorso base in produzione non è la root
  return import.meta.env.BASE_URL.length > 1;
};