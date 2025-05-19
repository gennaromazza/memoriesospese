
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
 * @returns URL normalizzato
 */
export const createUrl = (path: string): string => {
  // Gestione percorsi speciali
  if (path === '' || path === '/') {
    return '/';
  }
  
  // Normalizza il percorso aggiungendo slash iniziale se mancante
  return path.startsWith('/') ? path : `/${path}`;
};

/**
 * Crea URL assoluto con origine
 * @param path Percorso relativo
 * @returns URL assoluto completo di origine
 */
export const createAbsoluteUrl = (path: string): string => {
  // Assicurati che non ci siano doppie barre nell'URL
  const basePath = createUrl(path);
  return `${window.location.origin}${basePath}`.replace(/([^:]\/)\/+/g, "$1");
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
 * @returns sempre false poiché l'app è configurata per eseguire alla radice
 */
export const isInSubdirectory = (): boolean => {
  return false;
};
