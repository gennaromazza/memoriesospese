
// Utility per gestire il percorso base dell'applicazione
// Supporta sia installazione root che in sottocartella
import { PRODUCTION_BASE_PATH } from '../config';

/**
 * Restituisce il percorso base dell'applicazione
 * In sviluppo: sempre '/'
 * In produzione: utilizza il percorso configurato in config.ts
 */
export const getBasePath = (): string => {
  // In ambiente di sviluppo, usa sempre la root
  if (!import.meta.env.PROD) {
    return '/';
  }
  
  // In produzione, usa il percorso configurato
  return PRODUCTION_BASE_PATH;
};

/**
 * Crea un URL per i link interni all'applicazione
 * @param path Percorso relativo (con o senza slash iniziale)
 * @returns URL normalizzato con il percorso base corretto
 */
export const createUrl = (path: string): string => {
  if (!import.meta.env.PROD) {
    return path === '' || path === '/' ? '/' : (path.startsWith('/') ? path : `/${path}`);
  }
  
  const base = PRODUCTION_BASE_PATH.replace(/\/$/, '');
  if (path === '' || path === '/') {
    return `${base}/`;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

/**
 * Crea URL assoluto con origine
 * @param path Percorso relativo
 * @returns URL assoluto completo di origine e sottocartella
 */
export const createAbsoluteUrl = (path: string): string => {
  // Usa createUrl per ottenere il percorso corretto con la base path
  const url = createUrl(path);
  // Assicurati che non ci siano doppie barre nell'URL
  return `${window.location.origin}${url}`.replace(/([^:]\/)\/+/g, "$1");
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
  return PRODUCTION_BASE_PATH.length > 1;
};
