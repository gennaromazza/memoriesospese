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

export const createUrl = (path: string): string => {
  // Vite BASE_URL è già '/wedgallery/' in prod, '' in dev
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;

  return import.meta.env.PROD
    ? `${base}${p}`          // in prod: '/wedgallery' + '/…'
    : p;                     // in dev: '/…'
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
  return PRODUCTION_BASE_PATH.length > 1;
};